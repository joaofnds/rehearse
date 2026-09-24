import { z } from "zod";
import type { Immutable } from "#benchmark/contracts";
import { loadRunManifest } from "#benchmark/manifest";
import {
	benchmarkRunPaths,
	runEventsDatabaseFile,
} from "#benchmark/run-layout";
import type { BenchmarkRunPaths } from "#benchmark/run-layout";
import { openRunEventStore } from "#benchmark/run-events";
import type { RunEventStore } from "#benchmark/run-events";
import type { RunLiveness } from "#benchmark/run-liveness";
import { stoppedStage } from "#benchmark/run-outcome";
import { claimsLiveTarget, failedStage } from "./run-history";

export const INTERRUPTED_REASON =
	"the run was interrupted before its final judge";
export const RUN_FAILED_REASON = "the run failed before its final judge";
export const AWAITING_JUDGMENT_REASON =
	"the run ended while this stage awaited judgment";
export const UNEXPLAINED_END_REASON =
	"the run ended without recording how it ended";

export type Reading<Value> =
	| ({ readonly state: "available" } & Value)
	| { readonly state: "unavailable"; readonly reasons: readonly string[] };

export interface RunRecordStage {
	readonly stage: string;
	readonly sessionCost: Reading<{ readonly usd: number }>;
	readonly judgeCost: Reading<{ readonly usd: number }>;
}

/**
 * The final judge's recorded outcome, which the design calls the task grade.
 * The judge returns PASS or FAIL and no letter, so none is served.
 */
export type FinalOutcome =
	| { readonly status: "JUDGED"; readonly verdict: "PASS" | "FAIL" }
	| { readonly status: "JUDGING_FAILED"; readonly reason: string }
	| {
			readonly status: "NOT_REACHED";
			readonly stage?: string | undefined;
			readonly reason: string;
	  }
	| { readonly status: "PENDING" };

export interface RunRecord {
	readonly run: string;
	readonly stages: readonly RunRecordStage[];
	readonly finalOutcome: FinalOutcome;
}

const stageFileSchema = z
	.object({
		status: z.string().optional(),
		costUsd: z.number().optional(),
		input: z
			.object({
				transcript: z
					.object({ costUsd: z.number().optional() })
					.loose()
					.optional(),
			})
			.loose()
			.optional(),
	})
	.loose();

type StageFile = Immutable<z.infer<typeof stageFileSchema>>;

interface RecordedStage {
	readonly stage: string;
	readonly file: StageFile | undefined;
}

const gradedArtifactSchema = z
	.object({ grade: z.object({ verdict: z.enum(["PASS", "FAIL"]) }).loose() })
	.loose();

/**
 * What a main artifact carries in place of a grade when the final judge
 * never returned one.
 */
const failedJudgeArtifactSchema = z
	.object({ failure: z.string().min(1) })
	.loose();

function usd(
	amount: number | undefined,
	missing: string,
): Reading<{ readonly usd: number }> {
	if (amount === undefined) {
		return { state: "unavailable", reasons: [missing] };
	}

	return { state: "available", usd: amount };
}

async function readStageFile(
	paths: BenchmarkRunPaths,
	stage: string,
): Promise<StageFile | undefined> {
	const file = Bun.file(paths.stageFile(stage));
	if (!(await file.exists())) {
		return undefined;
	}

	return stageFileSchema.parse(JSON.parse(await file.text()));
}

function stageRecord({ stage, file }: RecordedStage): RunRecordStage {
	return {
		stage,
		sessionCost: usd(
			file?.input?.transcript?.costUsd,
			"the stage record holds no session cost",
		),
		judgeCost: usd(file?.costUsd, "the stage record holds no judge cost"),
	};
}

function stageWithStatus(
	stages: readonly RecordedStage[],
	status: string,
): RecordedStage | undefined {
	return stages.find(({ file }) => file?.status === status);
}

/**
 * The records say how a run ended in this order: the main artifact once the
 * final judge ran, a stop record or a record left awaiting judgment, and only
 * then the event stream, which is best effort and is the one place an
 * interruption or an abort is recorded at all.
 */
async function finalOutcome(
	runsDirectory: string,
	run: string,
	stages: readonly RecordedStage[],
	runEvents: RunEventStore,
	liveness: RunLiveness,
): Promise<FinalOutcome> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	const artifactFile = Bun.file(paths.artifactFile);
	if (await artifactFile.exists()) {
		const artifact: unknown = JSON.parse(await artifactFile.text());
		const graded = gradedArtifactSchema.safeParse(artifact);
		if (graded.success) {
			return { status: "JUDGED", verdict: graded.data.grade.verdict };
		}

		return {
			status: "JUDGING_FAILED",
			reason: failedJudgeArtifactSchema.parse(artifact).failure,
		};
	}

	const stopped = await stoppedStage(runsDirectory, run);
	if (stopped !== undefined) {
		return {
			status: "NOT_REACHED",
			stage: stopped.stage,
			reason: stopped.error,
		};
	}

	const awaiting = stageWithStatus(stages, "AWAITING_STAGE_JUDGE");
	if (awaiting !== undefined) {
		return {
			status: "NOT_REACHED",
			stage: awaiting.stage,
			reason: AWAITING_JUDGMENT_REASON,
		};
	}

	const latest = runEvents.latestEvent(run);
	if (latest?.kind === "run-interrupted") {
		return {
			status: "NOT_REACHED",
			stage: latest.stage,
			reason: INTERRUPTED_REASON,
		};
	}
	if (latest?.kind === "run-failed") {
		return {
			status: "NOT_REACHED",
			stage: failedStage(runEvents, run),
			reason: RUN_FAILED_REASON,
		};
	}
	if (await claimsLiveTarget(paths.manifestFile, liveness)) {
		return { status: "PENDING" };
	}

	return {
		status: "NOT_REACHED",
		stage: latest?.stage,
		reason: UNEXPLAINED_END_REASON,
	};
}

/**
 * One pipeline run projected across the files it wrote: its manifest for the
 * stage order, each stage's own record, its checkpoints, and its main
 * artifact when it finished. `/api/records/:id` serves one of those files
 * whole; this reads all of them into the figures a run's page shows.
 */
export async function readRunRecord(
	runsDirectory: string,
	run: string,
	liveness: RunLiveness,
): Promise<RunRecord> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	const manifest = await loadRunManifest(paths.manifestFile);
	const stages: RecordedStage[] = [];
	for (const { name } of manifest.pipeline.stages) {
		stages.push({ stage: name, file: await readStageFile(paths, name) });
	}

	const runEvents = await openRunEventStore(
		runEventsDatabaseFile(runsDirectory),
	);
	try {
		return {
			run,
			stages: stages.map((stage) => stageRecord(stage)),
			finalOutcome: await finalOutcome(
				runsDirectory,
				run,
				stages,
				runEvents,
				liveness,
			),
		};
	} finally {
		runEvents.close();
	}
}
