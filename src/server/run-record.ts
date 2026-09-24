import { z } from "zod";
import {
	hashedFileSchema,
	INITIAL_CHECKPOINT_STAGE,
	readCheckpointRecord,
} from "#benchmark/checkpoint";
import type { CheckpointRecord, HashedFile } from "#benchmark/checkpoint";
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
import {
	checkpointStageNumber,
	formatCheckpointShortId,
	readShortIds,
} from "#benchmark/short-id";
import { formatRecordId } from "#cli/record-id";
import { shortIdsOf } from "#cli/short-id-column";
import { redactAbsolutePaths } from "./redact-path";
import { claimsLiveTarget, failedStage, runStatus } from "./run-status";

export const INTERRUPTED_REASON =
	"the run was interrupted before its final judge";
export const RUN_FAILED_REASON = "the run failed before its final judge";
export const AWAITING_JUDGMENT_REASON =
	"the run ended while this stage awaited judgment";
export const AWAITING_GRADE_REASON = "the stage's judge has not returned";
export const UNEXPLAINED_END_REASON =
	"the run ended without recording how it ended";
export const PRODUCT_OWNER_COST_REASON =
	"only the main artifact records the Product Owner's cost, and the run wrote none";
export const STOPPED_GRADE_REASON = "a stop record keeps no letter grade";
export const WALL_TIME_REASON =
	"no record keeps when a stage or run started and ended";
export const UNRECORDED_STAGE_REASON =
	"the stage has written no record, and the run ended or is running in it";
export const MINIMUM_GRADE_REASON =
	"the run manifest does not record the minimum grade";
export const PRODUCT_OWNER_TOKENS_REASON =
	"no record keeps the Product Owner's call metrics";

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
	readonly grade: Reading<{
		readonly letter: string;
		readonly verdict: string;
	}>;
	readonly wallTime: Reading<{ readonly ms: number }>;
	readonly sessionCost: Reading<{ readonly usd: number }>;
	readonly judgeCost: Reading<{ readonly usd: number }>;
	readonly tokens: TokenReading;
	/** Whether the stage saved a checkpoint; a stopped stage never does. */
	readonly checkpoint: "recorded" | "missing";
	readonly checkpointShortId: ShortIdReading;
	/** The corpus files the stage ran under, from its checkpoint or record. */
	readonly instructionFiles: Reading<{ readonly files: readonly HashedFile[] }>;
	readonly artifactsOut: ArtifactsOut;
}

export type ShortIdReading = Reading<{ readonly shortId: string }>;

export type PathsReading = Reading<{ readonly paths: readonly string[] }>;

export interface WorkflowStateChange {
	readonly path: string;
	readonly change: "added" | "modified" | "removed";
}

export interface ArtifactsOut {
	/** The artifact the stage declares, as its checkpoint recorded it. */
	readonly declared: PathsReading;
	/** Workflow-state files the stage changed against its upstream checkpoint. */
	readonly workflowState: Reading<{
		readonly changes: readonly WorkflowStateChange[];
	}>;
	readonly commitSubjects: Reading<{ readonly subjects: readonly string[] }>;
	readonly changedPaths: PathsReading;
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
	| { readonly status: "PENDING"; readonly stage: string };

export interface CostPart {
	readonly part: string;
	readonly usd: number;
}

/** Every recorded spend summed, naming each part summed and each lacked. */
export type CostReading = Reading<{
	readonly usd: number;
	readonly parts: readonly CostPart[];
	readonly missing: readonly MissingPart[];
}>;

export type WallTimeReading = Reading<{ readonly ms: number }>;

export interface RunTotals {
	readonly tokens: TokenReading;
	readonly cost: CostReading;
	readonly productOwnerCost: Reading<{ readonly usd: number }>;
	readonly wallTime: WallTimeReading;
}

export interface RunRecord {
	readonly run: string;
	readonly shortId: ShortIdReading;
	readonly caseId: string;
	readonly status: Reading<{ readonly status: string }>;
	readonly minimumGrade: Reading<{ readonly letter: string }>;
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
		grade: z
			.object({ grade: z.string(), verdict: z.string() })
			.loose()
			.optional(),
		attempts: callsSchema.optional(),
		corpusFiles: z.array(hashedFileSchema).optional(),
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

/** A recorded stage, and whether the run ended in it or is running in it. */
interface ReachedStage extends RecordedStage {
	readonly reached: boolean;
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

const UNRECORDED_WALL_TIME: Reading<{ readonly ms: number }> = {
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
	reason: string,
): Reading<{ readonly usd: number }> {
	if (amount === undefined) {
		return { state: "unavailable", reasons: [reason] };
	}

	return { state: "available", usd: amount };
}

function filesOf(
	files: readonly HashedFile[] | undefined,
): RunRecordStage["instructionFiles"] {
	if (files === undefined) {
		return {
			state: "unavailable",
			reasons: [
				"neither a checkpoint nor the stage record lists the stage's corpus files",
			],
		};
	}

	return { state: "available", files };
}

function pathsOf(
	files: readonly { readonly path: string }[] | undefined,
	absent: string,
): PathsReading {
	if (files === undefined) {
		return { state: "unavailable", reasons: [absent] };
	}

	return { state: "available", paths: files.map(({ path }) => path) };
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
	if (calls.length === 0) {
		return { missing: { part, reason: "the record holds no calls" } };
	}

	if (calls.some(({ metrics }) => metrics === undefined)) {
		return {
			missing: { part, reason: "a call in the record has no metrics" },
		};
	}

	return { calls };
}

/** Why a stage's figure is missing: its record lacks it, or it wrote none. */
function unrecordedOr(file: StageFile | undefined, reason: string): string {
	return file === undefined ? UNRECORDED_STAGE_REASON : reason;
}

type Spender = "session" | "judge";

/**
 * Who spent on a stage: its session, then its judge once the judge ran. A
 * stage that wrote no record spent only when the run ended or runs in it.
 */
function spenders(status: StageStatus, reached: boolean): readonly Spender[] {
	if (status === "no-record") {
		return reached ? ["session"] : [];
	}

	if (status === "awaiting-judgment") {
		return ["session"];
	}

	return ["session", "judge"];
}

function stageTokenParts({
	stage,
	file,
	reached,
}: ReachedStage): readonly TokenPart[] {
	return spenders(stageStatus(file), reached).map((spender) =>
		spender === "session"
			? callsPart(
					`${stage} session`,
					file?.input?.transcript?.providerCalls,
					unrecordedOr(file, "the stage record holds no session calls"),
				)
			: callsPart(
					`${stage} judge`,
					file?.attempts,
					unrecordedOr(file, "the stage record holds no judge attempts"),
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
	"awaiting-judgment": AWAITING_GRADE_REASON,
	"no-record": "the stage wrote no record",
	graded: "the scorecard holds no letter",
} as const satisfies Record<StageStatus, string>;

function stageRecord(
	recorded: ReachedStage,
	checkpoints: CheckpointsByLineage,
	checkpointShortId: ShortIdReading,
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
				: {
						state: "available",
						letter: file.grade.grade,
						verdict: file.grade.verdict,
					},
		wallTime: UNRECORDED_WALL_TIME,
		sessionCost: usd(
			file?.input?.transcript?.costUsd,
			unrecordedOr(file, "the stage record holds no session cost"),
		),
		judgeCost: usd(
			file?.costUsd,
			unrecordedOr(file, "the stage record holds no judge cost"),
		),
		tokens: tokenReading(stageTokenParts(recorded)),
		checkpoint: checkpoint === undefined ? "missing" : "recorded",
		checkpointShortId,
		instructionFiles: filesOf(checkpoint?.corpusFiles ?? file?.corpusFiles),
		artifactsOut: {
			declared: pathsOf(
				checkpoint?.artifacts,
				"the stage saved no checkpoint to declare its artifact",
			),
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
	reached: boolean,
): readonly (CostPart | MissingPart)[] {
	return spenders(stage.status, reached).map((spender) =>
		spender === "session"
			? costPart(`${stage.stage} session`, stage.sessionCost)
			: costPart(`${stage.stage} judge`, stage.judgeCost),
	);
}

function runTotals(
	stages: readonly RunRecordStage[],
	reachedStage: string | undefined,
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
		...stages.flatMap((stage) =>
			stageCostParts(stage, stage.stage === reachedStage),
		),
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
		wallTime: UNRECORDED_WALL_TIME,
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
	status: "STAGE_JUDGE_FAILED" | "AWAITING_STAGE_JUDGE",
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
		return { status: "PENDING", stage: latest.stage };
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

async function readRunShortId(
	runsDirectory: string,
	caseId: string,
	run: string,
): Promise<ShortIdReading> {
	/**
	 * The registry names the run and nothing else, so a registry that cannot
	 * be read costs the record its short id rather than every figure.
	 */
	try {
		const shortId = shortIdsOf(await readShortIds(runsDirectory, caseId)).get(
			formatRecordId({ kind: "run", run }),
		);
		if (shortId === undefined) {
			return {
				state: "unavailable",
				reasons: ["no command claimed a short id for the run"],
			};
		}

		return { state: "available", shortId };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return { state: "unavailable", reasons: [redactAbsolutePaths(message)] };
	}
}

function stageCheckpointShortId(
	runShortId: ShortIdReading,
	stages: readonly string[],
	{ stage, checkpoint }: RecordedStage,
): ShortIdReading {
	const number = checkpointStageNumber(stages, stage);
	if (checkpoint === undefined || number === undefined) {
		return {
			state: "unavailable",
			reasons: ["the stage saved no checkpoint"],
		};
	}

	if (runShortId.state === "unavailable") {
		return runShortId;
	}

	return {
		state: "available",
		shortId: formatCheckpointShortId(runShortId.shortId, number),
	};
}

async function statusReading(
	runsDirectory: string,
	run: string,
	runEvents: RunEventStore,
	liveness: RunLiveness,
): Promise<Reading<{ readonly status: string }>> {
	try {
		const status = await runStatus(runsDirectory, run, runEvents, liveness);
		if (status === undefined) {
			return {
				state: "unavailable",
				reasons: ["run history lists no row for the run"],
			};
		}

		return { state: "available", status };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return { state: "unavailable", reasons: [redactAbsolutePaths(message)] };
	}
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

	const artifact = await readArtifactSpend(paths);
	const shortId = await readRunShortId(runsDirectory, manifest.caseId, run);
	const runEvents = await openRunEventStore(
		runEventsDatabaseFile(runsDirectory),
	);
	try {
		const outcome = await finalOutcome(
			runsDirectory,
			run,
			stages,
			runEvents,
			liveness,
		);
		const reachedStage =
			outcome.status === "NOT_REACHED" || outcome.status === "PENDING"
				? outcome.stage
				: undefined;
		const reached = stages.map(({ stage, file, checkpoint }): ReachedStage => ({
			stage,
			file,
			checkpoint,
			reached: stage === reachedStage,
		}));
		const names = stages.map(({ stage }) => stage);
		const records = reached.map((stage) =>
			stageRecord(
				stage,
				checkpoints,
				stageCheckpointShortId(shortId, names, stage),
			),
		);

		return {
			run,
			shortId,
			caseId: manifest.caseId,
			status: await statusReading(runsDirectory, run, runEvents, liveness),
			minimumGrade: { state: "unavailable", reasons: [MINIMUM_GRADE_REASON] },
			stages: records,
			totals: runTotals(
				records,
				reachedStage,
				[
					...reached.flatMap((stage) => stageTokenParts(stage)),
					...runTokenParts(artifact),
				],
				artifact,
			),
			finalOutcome: outcome,
		};
	} finally {
		runEvents.close();
	}
}
