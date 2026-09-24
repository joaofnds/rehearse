import { z } from "zod";
import { claudeCallMetricsSchema } from "#benchmark/contracts";
import type { ClaudeCallMetrics, Immutable } from "#benchmark/contracts";
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
export const PRODUCT_OWNER_TOKENS_REASON =
	"the run records the Product Owner's cost but not its call metrics";

export type Reading<Value> =
	| ({ readonly state: "available" } & Value)
	| { readonly state: "unavailable"; readonly reasons: readonly string[] };

/** A part of a sum the records do not hold, and why. */
export interface MissingPart {
	readonly part: string;
	readonly reason: string;
}

export interface TokenCounts {
	readonly input: number;
	readonly cacheRead: number;
	readonly cacheWrite: number;
	readonly output: number;
	/** Input, cache read and cache write together: all the model read. */
	readonly totalInput: number;
}

/**
 * A sum over the parts the records hold, naming each part they lack, so a
 * partial figure is never read as the whole.
 */
export type TokenReading = Reading<
	TokenCounts & { readonly missing: readonly MissingPart[] }
>;

export interface RunRecordStage {
	readonly stage: string;
	readonly sessionCost: Reading<{ readonly usd: number }>;
	readonly judgeCost: Reading<{ readonly usd: number }>;
	readonly tokens: TokenReading;
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
	readonly totals: { readonly tokens: TokenReading };
	readonly finalOutcome: FinalOutcome;
}

/** Stands for a call count a record keeps in place of the calls. */
const COUNTED_CALLS = "counted" as const;

const callsSchema = z.array(
	z.object({ metrics: claudeCallMetricsSchema.optional() }).loose(),
);

const stageFileSchema = z
	.object({
		status: z.string().optional(),
		costUsd: z.number().optional(),
		attempts: callsSchema.optional(),
		input: z
			.object({
				transcript: z
					.object({
						costUsd: z.number().optional(),
						/** A count, not a list, in the oldest awaiting-judgment records. */
						providerCalls: z
							.union([callsSchema, z.number().transform(() => COUNTED_CALLS)])
							.optional(),
					})
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

const artifactCallsSchema = z
	.object({ judgeAttempts: callsSchema.optional() })
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

type Calls = Immutable<z.infer<typeof callsSchema>>;

/** A part of a sum: the calls the records hold for it, or why they hold none. */
type TokenPart = { readonly calls: Calls } | { readonly missing: MissingPart };

function callsPart(
	part: string,
	calls: Calls | typeof COUNTED_CALLS | undefined,
	absent: string,
): TokenPart {
	if (calls === undefined) {
		return { missing: { part, reason: absent } };
	}
	if (calls === COUNTED_CALLS) {
		return {
			missing: {
				part,
				reason: "the record counts its calls but keeps no call metrics",
			},
		};
	}
	if (calls.some(({ metrics }) => metrics === undefined)) {
		return {
			missing: { part, reason: "a call in the record has no metrics" },
		};
	}

	return { calls };
}

function stageTokenParts({ stage, file }: RecordedStage): readonly TokenPart[] {
	if (file === undefined) {
		return [];
	}

	const session = callsPart(
		`${stage} session`,
		file.input?.transcript?.providerCalls,
		"the stage record holds no session calls",
	);
	if (file.status === "AWAITING_STAGE_JUDGE") {
		return [session];
	}

	return [
		session,
		callsPart(
			`${stage} judge`,
			file.attempts,
			"the stage record holds no judge attempts",
		),
	];
}

function tokenReading(parts: readonly TokenPart[]): TokenReading {
	const metrics: ClaudeCallMetrics[] = [];
	const missing: MissingPart[] = [];
	for (const part of parts) {
		if ("missing" in part) {
			missing.push(part.missing);
		} else {
			for (const call of part.calls) {
				if (call.metrics !== undefined) {
					metrics.push(call.metrics);
				}
			}
		}
	}
	if (!parts.some((part) => "calls" in part)) {
		return {
			state: "unavailable",
			reasons:
				missing.length === 0
					? ["the records hold no calls for this sum"]
					: missing.map(({ part, reason }) => `${part}: ${reason}`),
		};
	}

	const input = total(metrics, "inputTokens");
	const cacheRead = total(metrics, "cacheReadTokens");
	const cacheWrite = total(metrics, "cacheWriteTokens");

	return {
		state: "available",
		input,
		cacheRead,
		cacheWrite,
		output: total(metrics, "outputTokens"),
		totalInput: input + cacheRead + cacheWrite,
		missing,
	};
}

function total(
	metrics: readonly ClaudeCallMetrics[],
	field:
		| "inputTokens"
		| "outputTokens"
		| "cacheReadTokens"
		| "cacheWriteTokens",
): number {
	return metrics.reduce((sum, call) => sum + call[field], 0);
}

function stageRecord(recorded: RecordedStage): RunRecordStage {
	const { file } = recorded;

	return {
		stage: recorded.stage,
		sessionCost: usd(
			file?.input?.transcript?.costUsd,
			"the stage record holds no session cost",
		),
		judgeCost: usd(file?.costUsd, "the stage record holds no judge cost"),
		tokens: tokenReading(stageTokenParts(recorded)),
	};
}

/**
 * The run's parts beyond its stages: the Product Owner, whose calls no record
 * keeps metrics for, and the final judge once the main artifact holds it.
 */
async function runTokenParts(
	paths: BenchmarkRunPaths,
): Promise<readonly TokenPart[]> {
	const productOwner: TokenPart = {
		missing: { part: "Product Owner", reason: PRODUCT_OWNER_TOKENS_REASON },
	};
	const artifactFile = Bun.file(paths.artifactFile);
	if (!(await artifactFile.exists())) {
		return [productOwner];
	}

	const artifact = artifactCallsSchema.parse(
		JSON.parse(await artifactFile.text()),
	);

	return [
		productOwner,
		callsPart(
			"final judge",
			artifact.judgeAttempts,
			"the main artifact holds no judge attempts",
		),
	];
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
			totals: {
				tokens: tokenReading([
					...stages.flatMap((stage) => stageTokenParts(stage)),
					...(await runTokenParts(paths)),
				]),
			},
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
