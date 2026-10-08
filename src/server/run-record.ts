import { basename } from "node:path";
import { z } from "zod";
import {
	hashedFileSchema,
	INITIAL_CHECKPOINT_STAGE,
	readCheckpointRecord,
} from "#benchmark/checkpoint";
import type { CheckpointRecord, HashedFile } from "#benchmark/checkpoint";
import { STAGE_LETTER_GRADES } from "#benchmark/config";
import type { Effort, StageLetterGrade } from "#benchmark/config";
import {
	claudeCallMetricsSchema,
	gradedHardBlockersSchema,
} from "#benchmark/contracts";
import { corpusMeasurementSchema } from "#benchmark/corpus-measurement";
import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import type {
	ClaudeCallMetrics,
	GradedHardBlockers,
	Immutable,
} from "#benchmark/contracts";
import { loadRunManifest } from "#benchmark/manifest";
import { readManifestSchema } from "#benchmark/read-manifest";
import type { CorpusRoot } from "#benchmark/corpus-file";
import {
	checkpointStalenessOfRun,
	judgedStageReads,
} from "#benchmark/staleness-report";
import type { JudgedReadEntry } from "#benchmark/staleness-report";
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
import { letterReachesMinimum } from "#benchmark/stage-grading";
import {
	checkpointStageNumber,
	formatCheckpointShortId,
	readShortIds,
} from "#benchmark/short-id";
import { formatRecordId } from "#cli/record-id";
import { shortIdsOf } from "#cli/short-id-column";
import { redactAbsolutePaths } from "./redact-path";
import { claimsLiveTarget } from "#benchmark/run-liveness";
import { failedStage, runStatus } from "./run-status";

export const INTERRUPTED_REASON =
	"the run was interrupted before its final judge";
export const RUN_FAILED_REASON = "the run failed before its final judge";
export const AWAITING_JUDGMENT_REASON =
	"the run ended while this stage awaited judgment";
export const AWAITING_GRADE_REASON = "the stage's judge has not returned";
export const UNEXPLAINED_END_REASON =
	"the run ended without recording how it ended";
export const PRODUCT_OWNER_COST_REASON =
	"neither a main artifact nor a stop record holds the Product Owner's cost, as the run wrote neither, they predate it, or the run stopped before a stage's judge returned a grade";
export const STOPPED_GRADE_REASON =
	"the stop record keeps no letter grade, as it predates the letter or its judge returned none";
export const WALL_TIME_REASON =
	"the stage record keeps no elapsed time, as it predates the reading or its judge returned no grade";
export const RUN_WALL_TIME_REASON =
	"neither a main artifact nor a stop record holds the run's elapsed time, as the run wrote neither, they predate it, or the run stopped before a stage's judge returned a grade";
export const UNRECORDED_STAGE_REASON =
	"the stage has written no record, and the run ended or is running in it";
export const UNREACHED_STAGE_REASON = "the run has not reached the stage";
export const MISSING_STAGE_RECORD_REASON = "the stage has written no record";
export const UNGRADED_BLOCKERS_REASON =
	"the stage record holds no graded hard blockers";
export const MINIMUM_GRADE_REASON =
	"the run manifest predates the minimum grade";
export const PRODUCT_OWNER_TOKENS_REASON =
	"neither a main artifact nor a stop record holds the Product Owner's calls, as the run wrote neither, they predate them, or the run stopped before a stage's judge returned a grade";

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
		/**
		 * Whether the letter reaches the run's minimum grade, as the run's gate
		 * decides. The verdict is the judge's own, against a fixed line, so a run
		 * gated higher or lower can stop on a continuing verdict or go on past a
		 * stopping one.
		 */
		readonly reachesMinimum: boolean;
	}>;
	/** How many of the rubric's hard blockers the stage judge found fired. */
	readonly blockers: Reading<{
		readonly fired: number;
		readonly total: number;
		/** The id of each blocker the judge found fired, in rubric order. */
		readonly firedIds: readonly string[];
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
	/** The corpus version the stage ran against, from its checkpoint or record. */
	readonly corpusVersion: CorpusMeasurement | undefined;
	/**
	 * What the stage declared and loaded, from its checkpoint, or from its
	 * stage record when its judge stopped it before it saved one. A checkpoint's
	 * entries say whether each file changed since, where `readJudgedRunRecord`
	 * judged them.
	 */
	readonly readManifest: Reading<{
		readonly entries: readonly JudgedReadEntry[];
	}>;
	readonly artifactsIn: ArtifactsIn;
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

/** Something a stage's session started from, and where it came from. */
export type ArtifactIn =
	| { readonly from: "task declaration"; readonly taskId: string }
	| {
			readonly from: "upstream checkpoint";
			readonly target: string;
			/** The stage whose checkpoint it is, or the initial checkpoint's name. */
			readonly upstream: string;
			readonly checkpointShortId: ShortIdReading;
	  }
	| {
			readonly from: "earlier stage";
			readonly path: string;
			readonly change: Exclude<WorkflowStateChange["change"], "removed">;
			readonly stage: string;
	  };

/** What a stage started from, naming each earlier stage whose changes it cannot read. */
export interface ArtifactsIn {
	readonly entries: readonly ArtifactIn[];
	readonly missing: readonly MissingPart[];
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

/**
 * What the run ran against and with. The target is the source root's
 * directory name, since the absolute path names the operator's machine.
 */
export interface RunIdentity {
	readonly target: string;
	readonly commit: string;
	readonly model: string;
	readonly effort: Effort | undefined;
	/** Measured when the run started, before any stage measured its own. */
	readonly corpusVersion: CorpusMeasurement | undefined;
}

export interface RunRecord {
	readonly run: string;
	readonly shortId: ShortIdReading;
	readonly caseId: string;
	readonly identity: RunIdentity;
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
			.object({
				grade: z.string(),
				verdict: z.string(),
				hardBlockers: gradedHardBlockersSchema.optional(),
			})
			.loose()
			.optional(),
		hardBlockers: gradedHardBlockersSchema.optional(),
		attempts: callsSchema.optional(),
		/** Every call a failed Judge paid for, a halted one included. */
		judgeProviderCalls: callsSchema.optional(),
		corpusFiles: z.array(hashedFileSchema).optional(),
		corpusVersion: corpusMeasurementSchema.optional(),
		readManifest: readManifestSchema.optional(),
		elapsedMs: z.number().optional(),
		/** A stop record's run-wide readings, up to the stop. */
		runElapsedMs: z.number().optional(),
		productOwnerCostUsd: z.number().optional(),
		productOwnerProviderCalls: callsSchema.optional(),
		/** A ceiling stop's session up to the stop, when no Judge ran to hold it. */
		session: z
			.object({
				costUsd: z.number().optional(),
				providerCalls: callsSchema,
			})
			.optional(),
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

/**
 * Where a stage sits against the stage the run ended or is running in: that
 * stage, one after it, or one before it or in a run whose outcome names none.
 */
export type StagePlace = "current" | "unreached" | "elsewhere";

/** A recorded stage and its place in the run. */
interface PlacedStage extends RecordedStage {
	readonly place: StagePlace;
}

/** A run's checkpoints, the initial one included, by lineage. */
type CheckpointsByLineage = ReadonlyMap<string, CheckpointRecord>;

const gradedArtifactSchema = z
	.object({ grade: z.object({ verdict: z.enum(["PASS", "FAIL"]) }).loose() })
	.loose();

const artifactSpendSchema = z
	.object({
		judgeAttempts: callsSchema.optional(),
		/** Every call a failed final Judge paid for, a halted one included. */
		judgeProviderCalls: callsSchema.optional(),
		productOwnerCostUsd: z.number().optional(),
		productOwnerProviderCalls: callsSchema.optional(),
		judgeCostUsd: z.number().optional(),
		elapsedMs: z.number().optional(),
	})
	.loose();

type ArtifactSpend = Immutable<z.infer<typeof artifactSpendSchema>>;

/**
 * Where the run-wide readings live: the main artifact once the final judge
 * ran, else a stop record, which holds them up to the stop.
 */
interface RunWideRecords {
	readonly artifact: ArtifactSpend | undefined;
	readonly stopRecord: StageFile | undefined;
}

export function wallTime(
	ms: number | undefined,
	reason: string,
): Reading<{ readonly ms: number }> {
	if (ms === undefined) {
		return { state: "unavailable", reasons: [reason] };
	}

	return { state: "available", ms };
}

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

export async function readStageFile(
	paths: Pick<BenchmarkRunPaths, "stageFile">,
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

/** A record's empty call list is a spender that made no calls, summed as zero. */
function spentCallsPart(
	part: string,
	calls: Calls | undefined,
	absent: string,
): TokenPart {
	if (calls?.length === 0) {
		return { calls };
	}

	return callsPart(part, calls, absent);
}

/**
 * The index among the stage names given of the stage the run ended or is
 * running in, or -1 when its outcome names none of them.
 */
export function currentStageIndex(
	stages: readonly string[],
	outcome: FinalOutcome,
): number {
	if (outcome.status !== "NOT_REACHED" && outcome.status !== "PENDING") {
		return -1;
	}

	return outcome.stage === undefined ? -1 : stages.indexOf(outcome.stage);
}

export function stagePlace(index: number, currentIndex: number): StagePlace {
	if (index === currentIndex) {
		return "current";
	}

	if (currentIndex !== -1 && index > currentIndex) {
		return "unreached";
	}

	return "elsewhere";
}

const UNRECORDED_REASONS = {
	current: UNRECORDED_STAGE_REASON,
	unreached: UNREACHED_STAGE_REASON,
	elsewhere: MISSING_STAGE_RECORD_REASON,
} as const satisfies Record<StagePlace, string>;

/** Why a stage's figure is missing: its record lacks it, or it wrote none. */
function unrecordedOr({ file, place }: PlacedStage, reason: string): string {
	return file === undefined ? UNRECORDED_REASONS[place] : reason;
}

type Spender = "session" | "judge";

/**
 * Who spent on a stage: its session, then its judge once the judge ran. A
 * stage that wrote no record spent only when the run ended or runs in it. A
 * stop record without the Judge's input is a ceiling stop that came before
 * the Judge, while one an operator stop wrote mid-judgment keeps the input.
 */
function spenders({ file, place }: PlacedStage): readonly Spender[] {
	const status = stageStatus(file);
	if (status === "no-record") {
		return place === "current" ? ["session"] : [];
	}

	const judgeNeverRan = status === "stopped" && file?.input === undefined;
	if (status === "awaiting-judgment" || judgeNeverRan) {
		return ["session"];
	}

	return ["session", "judge"];
}

/**
 * A stop record's session reading with no calls is a session the ceiling
 * refused before its first call, which spent no tokens, while an empty
 * transcript is a record too old to keep its calls.
 */
function sessionTokenPart(recorded: PlacedStage): TokenPart {
	const { stage, file } = recorded;
	const transcriptCalls = file?.input?.transcript?.providerCalls;
	const part = `${stage} session`;
	const absent = unrecordedOr(
		recorded,
		"the stage record holds no session calls",
	);
	if (transcriptCalls === undefined) {
		return spentCallsPart(part, file?.session?.providerCalls, absent);
	}

	return callsPart(part, transcriptCalls, absent);
}

/**
 * A failed Judge's calls, a halted one included, read before its attempts,
 * which hold only the calls that returned. No calls is a Judge the ceiling
 * refused before its first call, which spent no tokens. Records written
 * before the calls were kept read from their attempts.
 */
function judgeTokenPart(
	part: string,
	judge: {
		readonly providerCalls: Calls | undefined;
		readonly attempts: Calls | undefined;
	},
	absent: string,
): TokenPart {
	if (judge.providerCalls === undefined) {
		return callsPart(part, judge.attempts, absent);
	}

	return spentCallsPart(part, judge.providerCalls, absent);
}

function stageTokenParts(recorded: PlacedStage): readonly TokenPart[] {
	const { stage, file } = recorded;
	return spenders(recorded).map((spender) =>
		spender === "session"
			? sessionTokenPart(recorded)
			: judgeTokenPart(
					`${stage} judge`,
					{ providerCalls: file?.judgeProviderCalls, attempts: file?.attempts },
					unrecordedOr(recorded, "the stage record holds no judge attempts"),
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

export function stageStatus(file: StageFile | undefined): StageStatus {
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
	graded: "the scorecard holds no letter",
} as const satisfies Record<Exclude<StageStatus, "no-record">, string>;

function ungradedReason(recorded: PlacedStage): string {
	const status = stageStatus(recorded.file);

	return status === "no-record"
		? UNRECORDED_REASONS[recorded.place]
		: UNGRADED_REASONS[status];
}

/**
 * A stage's tokens, or why it has none: a stage that wrote no record and did
 * not spend has no part to sum.
 */
function stageTokens(recorded: PlacedStage): TokenReading {
	const parts = stageTokenParts(recorded);

	return parts.length === 0
		? { state: "unavailable", reasons: [UNRECORDED_REASONS[recorded.place]] }
		: tokenReading(parts);
}

/** A hard blocker fired when its judge found it FAIL. */
export function firedBlockerIds(
	hardBlockers: GradedHardBlockers,
): readonly string[] {
	return hardBlockers
		.filter(({ status }) => status === "FAIL")
		.map(({ id }) => id);
}

/** The hard blockers a scorecard keeps in its grade, or a stop record beside it. */
export function recordedHardBlockers(
	file: StageFile | undefined,
): GradedHardBlockers | undefined {
	return file?.grade?.hardBlockers ?? file?.hardBlockers;
}

function blockersOf(recorded: PlacedStage): RunRecordStage["blockers"] {
	const hardBlockers = recordedHardBlockers(recorded.file);
	if (hardBlockers === undefined) {
		return {
			state: "unavailable",
			reasons: [unrecordedOr(recorded, UNGRADED_BLOCKERS_REASON)],
		};
	}

	const firedIds = firedBlockerIds(hardBlockers);

	return {
		state: "available",
		fired: firedIds.length,
		total: hardBlockers.length,
		firedIds,
	};
}

/** The corpus a stage ran under, from its checkpoint or, failing one, its record. */
function ranUnder({
	file,
	checkpoint,
}: RecordedStage): Pick<RunRecordStage, "instructionFiles" | "corpusVersion"> {
	return {
		instructionFiles: filesOf(checkpoint?.corpusFiles ?? file?.corpusFiles),
		corpusVersion: checkpoint?.corpusVersion ?? file?.corpusVersion,
	};
}

function readManifestOf({
	file,
	checkpoint,
}: RecordedStage): RunRecordStage["readManifest"] {
	const recorded = checkpoint?.readManifest ?? file?.readManifest;
	if (recorded !== undefined) {
		return { state: "available", entries: recorded };
	}
	if (checkpoint === undefined) {
		return {
			state: "unavailable",
			reasons: ["the stage saved no checkpoint"],
		};
	}

	return {
		state: "unavailable",
		reasons: ["the checkpoint was recorded before read manifests"],
	};
}

/**
 * A letter outside the gate's scale has no place against the minimum, so it
 * falls back to its judge's verdict.
 */
function reachesMinimum(
	grade: { readonly grade: string; readonly verdict: string },
	minimumGrade: StageLetterGrade | undefined,
): boolean {
	const letter = STAGE_LETTER_GRADES.find((each) => each === grade.grade);

	return letter === undefined
		? grade.verdict !== "STOP"
		: letterReachesMinimum(letter, minimumGrade);
}

function stageRecord(
	recorded: PlacedStage,
	checkpoints: CheckpointsByLineage,
	checkpointShortId: ShortIdReading,
	minimumGrade: StageLetterGrade | undefined,
	inputs: ArtifactsIn,
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
						reasons: [ungradedReason(recorded)],
					}
				: {
						state: "available",
						letter: file.grade.grade,
						verdict: file.grade.verdict,
						reachesMinimum: reachesMinimum(file.grade, minimumGrade),
					},
		blockers: blockersOf(recorded),
		wallTime: wallTime(
			file?.elapsedMs,
			stageStatus(file) === "awaiting-judgment"
				? AWAITING_GRADE_REASON
				: unrecordedOr(recorded, WALL_TIME_REASON),
		),
		sessionCost: usd(
			file?.input?.transcript?.costUsd ?? file?.session?.costUsd,
			unrecordedOr(recorded, "the stage record holds no session cost"),
		),
		judgeCost: usd(
			file?.costUsd,
			unrecordedOr(recorded, "the stage record holds no judge cost"),
		),
		tokens: stageTokens(recorded),
		checkpoint: checkpoint === undefined ? "missing" : "recorded",
		checkpointShortId,
		...ranUnder(recorded),
		readManifest: readManifestOf(recorded),
		artifactsIn: inputs,
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

/** Where a stage's session started: the target at the checkpoint before it. */
interface Upstream {
	readonly target: string;
	readonly upstream: string;
	readonly checkpointShortId: ShortIdReading;
}

/** The part of an earlier stage's record its later stages start from. */
interface EarlierStage {
	readonly stage: string;
	readonly artifactsOut: Pick<ArtifactsOut, "workflowState">;
}

/**
 * What a stage's session started from: the task card the case names, the
 * target at the checkpoint before it, and each workflow-state file an earlier
 * stage changed, named by the latest stage that changed it. A file an earlier
 * stage removed is not there to start from.
 */
export function artifactsIn(
	taskId: string,
	upstream: Upstream,
	earlier: readonly EarlierStage[],
): ArtifactsIn {
	const latest = new Map<string, ArtifactIn>();
	const missing: MissingPart[] = [];
	for (const { stage, artifactsOut } of earlier) {
		const { workflowState } = artifactsOut;
		if (workflowState.state === "unavailable") {
			missing.push({ part: stage, reason: workflowState.reasons.join("; ") });
			continue;
		}
		for (const { path, change } of workflowState.changes) {
			latest.delete(path);
			if (change !== "removed") {
				latest.set(path, { from: "earlier stage", path, change, stage });
			}
		}
	}

	return {
		entries: [
			{ from: "task declaration", taskId },
			{ from: "upstream checkpoint", ...upstream },
			...latest.values(),
		],
		missing,
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
	recorded: PlacedStage,
): readonly (CostPart | MissingPart)[] {
	return spenders(recorded).map((spender) =>
		spender === "session"
			? costPart(`${stage.stage} session`, stage.sessionCost)
			: costPart(`${stage.stage} judge`, stage.judgeCost),
	);
}

/**
 * The spend summed over the parts recorded, naming each part lacked, and
 * unavailable when no part was recorded rather than a sum of zero.
 */
export function costReading(
	spend: readonly (CostPart | MissingPart)[],
): CostReading {
	const parts = spend.filter((part): part is CostPart => "usd" in part);
	const missing = spend.filter((part): part is MissingPart => "reason" in part);
	if (parts.length === 0) {
		return {
			state: "unavailable",
			reasons: missing.map(({ part, reason }) => `${part}: ${reason}`),
		};
	}

	return {
		state: "available",
		usd: parts.reduce((sum, part) => sum + part.usd, 0),
		parts,
		missing,
	};
}

function runTotals(
	stageParts: readonly (CostPart | MissingPart)[],
	tokenParts: readonly TokenPart[],
	{ artifact, stopRecord }: RunWideRecords,
): RunTotals {
	const productOwnerCost = usd(
		artifact === undefined
			? stopRecord?.productOwnerCostUsd
			: artifact.productOwnerCostUsd,
		PRODUCT_OWNER_COST_REASON,
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
	const summed = [...stageParts, ...runParts];

	return {
		tokens: tokenReading(tokenParts),
		cost: costReading(summed),
		productOwnerCost,
		wallTime: wallTime(
			artifact === undefined ? stopRecord?.runElapsedMs : artifact.elapsedMs,
			RUN_WALL_TIME_REASON,
		),
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
 * The run's parts beyond its stages: the Product Owner, whose calls the main
 * artifact or a stop record holds, and the final judge once the main
 * artifact holds it. A Product Owner never asked made no calls, so its empty
 * list is a part summed rather than one lacked.
 */
function runTokenParts({
	artifact,
	stopRecord,
}: RunWideRecords): readonly TokenPart[] {
	const productOwnerCalls =
		artifact === undefined
			? stopRecord?.productOwnerProviderCalls
			: artifact.productOwnerProviderCalls;
	const productOwner = spentCallsPart(
		"Product Owner",
		productOwnerCalls,
		PRODUCT_OWNER_TOKENS_REASON,
	);
	if (artifact === undefined) {
		return [productOwner];
	}

	return [
		productOwner,
		judgeTokenPart(
			"final judge",
			{
				providerCalls: artifact.judgeProviderCalls,
				attempts: artifact.judgeAttempts,
			},
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

	const runWide: RunWideRecords = {
		artifact: await readArtifactSpend(paths),
		stopRecord: stageWithStatus(stages, "STAGE_JUDGE_FAILED")?.file,
	};
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
		const names = stages.map(({ stage }) => stage);
		const currentIndex = currentStageIndex(names, outcome);
		const placed = stages.map(
			({ stage, file, checkpoint }, index): PlacedStage => ({
				stage,
				file,
				checkpoint,
				place: stagePlace(index, currentIndex),
			}),
		);
		const target = basename(manifest.sourceRoot);
		const initialShortId = stageCheckpointShortId(shortId, names, {
			stage: INITIAL_CHECKPOINT_STAGE,
			file: undefined,
			checkpoint: initial,
		});
		const records: RunRecordStage[] = [];
		const stageCost: (CostPart | MissingPart)[] = [];
		for (const stage of placed) {
			const previous = records.at(-1);
			const upstream: Upstream =
				previous === undefined
					? {
							target,
							upstream: INITIAL_CHECKPOINT_STAGE,
							checkpointShortId: initialShortId,
						}
					: {
							target,
							upstream: previous.stage,
							checkpointShortId: previous.checkpointShortId,
						};
			const record = stageRecord(
				stage,
				checkpoints,
				stageCheckpointShortId(shortId, names, stage),
				manifest.minimumGrade,
				artifactsIn(manifest.taskId, upstream, records),
			);
			records.push(record);
			stageCost.push(...stageCostParts(record, stage));
		}

		return {
			run,
			shortId,
			caseId: manifest.caseId,
			identity: {
				target,
				commit: manifest.sourceSha,
				model: manifest.model,
				effort: manifest.effort,
				corpusVersion: manifest.corpusVersion,
			},
			status: await statusReading(runsDirectory, run, runEvents, liveness),
			minimumGrade:
				manifest.minimumGrade === undefined
					? { state: "unavailable", reasons: [MINIMUM_GRADE_REASON] }
					: { state: "available", letter: manifest.minimumGrade },
			stages: records,
			totals: runTotals(
				stageCost,
				[
					...placed.flatMap((stage) => stageTokenParts(stage)),
					...runTokenParts(runWide),
				],
				runWide,
			),
			finalOutcome: outcome,
		};
	} finally {
		runEvents.close();
	}
}

/**
 * The run's record with each checkpoint's read manifest judged against the
 * corpus under test, as the run's page shows it. The run history reads the
 * unjudged record, since it judges each row once for itself. A corpus under
 * test that cannot judge the run leaves its entries without a state, since
 * the record stands on its own and the run history names why the run is
 * unreadable.
 */
export async function readJudgedRunRecord(
	runsDirectory: string,
	run: string,
	liveness: RunLiveness,
	source: CorpusRoot,
): Promise<RunRecord> {
	const record = await readRunRecord(runsDirectory, run, liveness);
	const checkpoints = await checkpointStalenessOfRun(
		runsDirectory,
		run,
		source,
	).catch(() => []);
	const judged = new Map(
		checkpoints.map(({ id, readManifest }) => [id, readManifest]),
	);

	const stages: RunRecordStage[] = [];
	for (const stage of record.stages) {
		stages.push(
			withJudgedReadManifest(
				stage,
				judged.get(
					formatRecordId({ kind: "checkpoint", run, stage: stage.stage }),
				) ?? (await stoppedStageReads(runsDirectory, run, stage.stage, source)),
			),
		);
	}

	return { ...record, stages };
}

/**
 * A stage that saved no checkpoint keeps its reads on its stage record, so
 * they are judged from there, and left unjudged where the corpus under test
 * cannot judge them.
 */
async function stoppedStageReads(
	runsDirectory: string,
	run: string,
	stage: string,
	source: CorpusRoot,
): Promise<readonly JudgedReadEntry[] | undefined> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	const file = await readStageFile(paths, stage);
	if (
		file?.readManifest === undefined ||
		(await readCheckpoint(paths, stage)) !== undefined
	) {
		return undefined;
	}

	return judgedStageReads(
		runsDirectory,
		run,
		stage,
		{ corpusFiles: file.corpusFiles ?? [], readManifest: file.readManifest },
		source,
	).catch(() => undefined);
}

/** A stage whose recorded manifest the judged one stands in for, when there is one. */
function withJudgedReadManifest(
	stage: RunRecordStage,
	judged: readonly JudgedReadEntry[] | undefined,
): RunRecordStage {
	if (stage.readManifest.state === "unavailable" || judged === undefined) {
		return stage;
	}

	return { ...stage, readManifest: { state: "available", entries: judged } };
}
