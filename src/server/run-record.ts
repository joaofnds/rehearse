import { z } from "zod";
import {
	INITIAL_CHECKPOINT_STAGE,
	readCheckpointRecord,
} from "#benchmark/checkpoint";
import type { CheckpointRecord } from "#benchmark/checkpoint";
import { claudeCallMetricsSchema } from "#benchmark/contracts";
import type { ClaudeCallMetrics, Immutable } from "#benchmark/contracts";
import { loadRunManifest } from "#benchmark/manifest";
import {
	benchmarkRunPaths,
	checkpointRecordFile,
	runEventsDatabaseFile,
} from "#benchmark/run-layout";
import type { BenchmarkRunPaths } from "#benchmark/run-layout";
import {
	isTerminalRunEventKind,
	openRunEventStore,
} from "#benchmark/run-events";
import type { RunEventStore } from "#benchmark/run-events";
import type { RunLiveness } from "#benchmark/run-liveness";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { stoppedStage } from "#benchmark/run-outcome";
import { claimsLiveTarget, failedStage } from "./run-history";

export const INTERRUPTED_REASON =
	"the run was interrupted before its final judge";
export const RUN_FAILED_REASON = "the run failed before its final judge";
export const AWAITING_JUDGMENT_REASON =
	"the run ended while this stage awaited judgment";
export const UNEXPLAINED_END_REASON =
	"the run ended without recording how it ended";
export const PRODUCT_OWNER_COST_REASON =
	"only the main artifact records the Product Owner's cost, and the run wrote none";
export const STOPPED_GRADE_REASON =
	"a stop record keeps the stage's findings but not its letter";
export const WALL_TIME_REASON =
	"no record keeps when a stage or run started and ended";
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

/** Which record a stage left: a scorecard, a stop record, or one awaiting its judge. */
export type StageStatus =
	| "graded"
	| "stopped"
	| "awaiting-judgment"
	| "no-record";

export interface RunRecordStage {
	readonly stage: string;
	readonly status: StageStatus;
	readonly grade: Reading<{ readonly letter: string }>;
	readonly wallTime: Reading<{ readonly ms: number }>;
	readonly sessionCost: Reading<{ readonly usd: number }>;
	readonly judgeCost: Reading<{ readonly usd: number }>;
	readonly tokens: TokenReading;
	/** Whether the stage saved a checkpoint; a stopped stage never does. */
	readonly checkpoint: "recorded" | "missing";
	/** The corpus files the stage ran under, from its checkpoint or record. */
	readonly instructionFiles: readonly string[];
	readonly artifactsOut: ArtifactsOut;
}

export interface WorkflowStateChange {
	readonly path: string;
	readonly change: "added" | "modified" | "removed";
}

export interface ArtifactsOut {
	/** The artifact the stage declares, as its checkpoint recorded it. */
	readonly declared: readonly string[];
	/** Workflow-state files the stage changed against its upstream checkpoint. */
	readonly workflowState: Reading<{
		readonly changes: readonly WorkflowStateChange[];
	}>;
	readonly commitSubjects: Reading<{ readonly subjects: readonly string[] }>;
	readonly changedPaths: Reading<{ readonly paths: readonly string[] }>;
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

export interface CostPart {
	readonly part: string;
	readonly usd: number;
}

export interface RunTotals {
	readonly tokens: TokenReading;
	/** Every recorded spend summed, naming each part summed and each lacked. */
	readonly cost: Reading<{
		readonly usd: number;
		readonly parts: readonly CostPart[];
		readonly missing: readonly MissingPart[];
	}>;
	readonly productOwnerCost: Reading<{ readonly usd: number }>;
	readonly wallTime: Reading<{ readonly ms: number }>;
}

export interface RunRecord {
	readonly run: string;
	readonly stages: readonly RunRecordStage[];
	readonly totals: RunTotals;
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
		grade: z.object({ grade: z.string() }).loose().optional(),
		attempts: callsSchema.optional(),
		corpusFiles: z.array(z.object({ path: z.string() }).loose()).optional(),
		input: z
			.object({
				commitSubjects: z.array(z.string()).optional(),
				changedPaths: z.array(z.string()).optional(),
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
	readonly checkpoint: CheckpointRecord | undefined;
}

/** A run's checkpoints, the initial one included, by lineage. */
type CheckpointsByLineage = ReadonlyMap<string, CheckpointRecord>;

const gradedArtifactSchema = z
	.object({ grade: z.object({ verdict: z.enum(["PASS", "FAIL"]) }).loose() })
	.loose();

const artifactSpendSchema = z
	.object({
		judgeAttempts: callsSchema.optional(),
		productOwnerCostUsd: z.number().optional(),
		judgeCostUsd: z.number().optional(),
	})
	.loose();

type ArtifactSpend = Immutable<z.infer<typeof artifactSpendSchema>>;

const WALL_TIME: Reading<{ readonly ms: number }> = {
	state: "unavailable",
	reasons: [WALL_TIME_REASON],
};

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

type Spender = "session" | "judge";

/**
 * Who spent on a stage: its session, then its judge once the judge ran. A
 * stage that wrote no record contributes nothing a sum could lack.
 */
function spenders(status: StageStatus): readonly Spender[] {
	if (status === "no-record") {
		return [];
	}
	if (status === "awaiting-judgment") {
		return ["session"];
	}

	return ["session", "judge"];
}

function stageTokenParts({ stage, file }: RecordedStage): readonly TokenPart[] {
	return spenders(stageStatus(file)).map((spender) =>
		spender === "session"
			? callsPart(
					`${stage} session`,
					file?.input?.transcript?.providerCalls,
					"the stage record holds no session calls",
				)
			: callsPart(
					`${stage} judge`,
					file?.attempts,
					"the stage record holds no judge attempts",
				),
	);
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

function workflowStateChanges(
	checkpoint: CheckpointRecord | undefined,
	checkpoints: CheckpointsByLineage,
): ArtifactsOut["workflowState"] {
	if (checkpoint === undefined) {
		return {
			state: "unavailable",
			reasons: ["the stage saved no checkpoint to compare"],
		};
	}
	const upstream = checkpoints.get(checkpoint.upstream);
	if (upstream === undefined) {
		return {
			state: "unavailable",
			reasons: ["the run holds no checkpoint the stage continued from"],
		};
	}

	const before = new Map(
		upstream.workflowState.map(({ path, sha256 }) => [path, sha256]),
	);
	const after = new Map(
		checkpoint.workflowState.map(({ path, sha256 }) => [path, sha256]),
	);
	const changes: WorkflowStateChange[] = [];
	for (const [path, sha256] of after) {
		const earlier = before.get(path);
		if (earlier === undefined) {
			changes.push({ path, change: "added" });
		} else if (earlier !== sha256) {
			changes.push({ path, change: "modified" });
		}
	}
	for (const path of before.keys()) {
		if (!after.has(path)) {
			changes.push({ path, change: "removed" });
		}
	}

	return { state: "available", changes };
}

function stageStatus(file: StageFile | undefined): StageStatus {
	if (file === undefined) {
		return "no-record";
	}
	if (file.status === "STAGE_JUDGE_FAILED") {
		return "stopped";
	}
	if (file.status === "AWAITING_STAGE_JUDGE") {
		return "awaiting-judgment";
	}

	return "graded";
}

const UNGRADED_REASONS = {
	stopped: STOPPED_GRADE_REASON,
	"awaiting-judgment": "the stage's judge never returned",
	"no-record": "the stage wrote no record",
	graded: "the scorecard holds no letter",
} as const satisfies Record<StageStatus, string>;

function stageRecord(
	recorded: RecordedStage,
	checkpoints: CheckpointsByLineage,
): RunRecordStage {
	const { file, checkpoint } = recorded;
	const commitSubjects = file?.input?.commitSubjects;
	const changedPaths = file?.input?.changedPaths;

	return {
		stage: recorded.stage,
		status: stageStatus(file),
		grade:
			file?.grade === undefined
				? {
						state: "unavailable",
						reasons: [UNGRADED_REASONS[stageStatus(file)]],
					}
				: { state: "available", letter: file.grade.grade },
		wallTime: WALL_TIME,
		sessionCost: usd(
			file?.input?.transcript?.costUsd,
			"the stage record holds no session cost",
		),
		judgeCost: usd(file?.costUsd, "the stage record holds no judge cost"),
		tokens: tokenReading(stageTokenParts(recorded)),
		checkpoint: checkpoint === undefined ? "missing" : "recorded",
		instructionFiles: (checkpoint?.corpusFiles ?? file?.corpusFiles ?? []).map(
			({ path }) => path,
		),
		artifactsOut: {
			declared: (checkpoint?.artifacts ?? []).map(({ path }) => path),
			workflowState: workflowStateChanges(checkpoint, checkpoints),
			commitSubjects:
				commitSubjects === undefined
					? {
							state: "unavailable",
							reasons: ["the stage record holds no commit subjects"],
						}
					: { state: "available", subjects: commitSubjects },
			changedPaths:
				changedPaths === undefined
					? {
							state: "unavailable",
							reasons: ["the stage record holds no changed paths"],
						}
					: { state: "available", paths: changedPaths },
		},
	};
}

async function readArtifactSpend(
	paths: BenchmarkRunPaths,
): Promise<ArtifactSpend | undefined> {
	const artifactFile = Bun.file(paths.artifactFile);
	if (!(await artifactFile.exists())) {
		return undefined;
	}

	return artifactSpendSchema.parse(JSON.parse(await artifactFile.text()));
}

function costPart(
	part: string,
	reading: Reading<{ readonly usd: number }>,
): CostPart | MissingPart {
	return reading.state === "available"
		? { part, usd: reading.usd }
		: { part, reason: reading.reasons.join("; ") };
}

function stageCostParts(
	stage: RunRecordStage,
): readonly (CostPart | MissingPart)[] {
	return spenders(stage.status).map((spender) =>
		spender === "session"
			? costPart(`${stage.stage} session`, stage.sessionCost)
			: costPart(`${stage.stage} judge`, stage.judgeCost),
	);
}

function runTotals(
	stages: readonly RunRecordStage[],
	tokenParts: readonly TokenPart[],
	artifact: ArtifactSpend | undefined,
): RunTotals {
	const productOwnerCost =
		artifact === undefined
			? usd(undefined, PRODUCT_OWNER_COST_REASON)
			: usd(
					artifact.productOwnerCostUsd,
					"the main artifact holds no Product Owner cost",
				);
	const runParts =
		artifact === undefined
			? [costPart("Product Owner", productOwnerCost)]
			: [
					costPart("Product Owner", productOwnerCost),
					costPart(
						"final judge",
						usd(
							artifact.judgeCostUsd,
							"the main artifact holds no final judge cost",
						),
					),
				];
	const summed = [
		...stages.flatMap((stage) => stageCostParts(stage)),
		...runParts,
	];
	const parts = summed.filter((part): part is CostPart => "usd" in part);
	const missing = summed.filter(
		(part): part is MissingPart => "reason" in part,
	);

	return {
		tokens: tokenReading(tokenParts),
		cost:
			parts.length === 0
				? {
						state: "unavailable",
						reasons: missing.map(({ part, reason }) => `${part}: ${reason}`),
					}
				: {
						state: "available",
						usd: parts.reduce((sum, part) => sum + part.usd, 0),
						parts,
						missing,
					},
		productOwnerCost,
		wallTime: WALL_TIME,
	};
}

async function readCheckpoint(
	paths: BenchmarkRunPaths,
	stage: string,
): Promise<CheckpointRecord | undefined> {
	const directory = paths.checkpointDirectory(stage);
	if (!(await Bun.file(checkpointRecordFile(directory)).exists())) {
		return undefined;
	}

	return readCheckpointRecord(directory);
}

/**
 * The run's parts beyond its stages: the Product Owner, whose calls no record
 * keeps metrics for, and the final judge once the main artifact holds it.
 */
function runTokenParts(
	artifact: ArtifactSpend | undefined,
): readonly TokenPart[] {
	const productOwner: TokenPart = {
		missing: { part: "Product Owner", reason: PRODUCT_OWNER_TOKENS_REASON },
	};
	if (artifact === undefined) {
		return [productOwner];
	}

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
 * final judge ran, a stop record, then the event stream, which is the one
 * place an interruption, an abort or a live run is recorded at all. A record
 * awaiting judgment is what every live run leaves while a stage is judged, so
 * it says the run ended there only once the stream says the run is not live.
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

	if (
		latest !== undefined &&
		!isTerminalRunEventKind(latest.kind) &&
		(await claimsLiveTarget(paths.manifestFile, liveness))
	) {
		return { status: "PENDING" };
	}

	const awaiting = stageWithStatus(stages, "AWAITING_STAGE_JUDGE");
	if (awaiting !== undefined) {
		return {
			status: "NOT_REACHED",
			stage: awaiting.stage,
			reason: AWAITING_JUDGMENT_REASON,
		};
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
	if (!(await Bun.file(paths.manifestFile).exists())) {
		throw new RefusedPreconditionError(`No pipeline run ${run} is recorded`);
	}
	const manifest = await loadRunManifest(paths.manifestFile);
	const stages: RecordedStage[] = [];
	for (const { name } of manifest.pipeline.stages) {
		stages.push({
			stage: name,
			file: await readStageFile(paths, name),
			checkpoint: await readCheckpoint(paths, name),
		});
	}
	const initial = await readCheckpoint(paths, INITIAL_CHECKPOINT_STAGE);
	const checkpoints = new Map(
		[initial, ...stages.map(({ checkpoint }) => checkpoint)]
			.filter((checkpoint) => checkpoint !== undefined)
			.map((checkpoint) => [checkpoint.lineage, checkpoint]),
	);

	const records = stages.map((stage) => stageRecord(stage, checkpoints));
	const artifact = await readArtifactSpend(paths);
	const runEvents = await openRunEventStore(
		runEventsDatabaseFile(runsDirectory),
	);
	try {
		return {
			run,
			stages: records,
			totals: runTotals(
				records,
				[
					...stages.flatMap((stage) => stageTokenParts(stage)),
					...runTokenParts(artifact),
				],
				artifact,
			),
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
