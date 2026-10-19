import type { CheckpointRecord, HashedFile } from "#benchmark/checkpoint";
import type { Effort } from "#benchmark/config";
import type { HumanReview } from "#benchmark/contracts";
import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import type { JudgedReadEntry } from "#benchmark/staleness-report";
import type { ArtifactSpend, StageFile } from "#server/run-stage-file";

type Reading<Value> =
	| ({ readonly state: "available" } & Value)
	| { readonly state: "unavailable"; readonly reasons: readonly string[] };

/** A part of a sum the records do not hold, and why. */
interface MissingPart {
	readonly part: string;
	readonly reason: string;
}

interface TokenCounts {
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
type TokenReading = Reading<
	TokenCounts & { readonly missing: readonly MissingPart[] }
>;

/** Which record a stage left: a scorecard, a stop record, or one awaiting its judge. */
type StageStatus = "graded" | "stopped" | "awaiting-judgment" | "no-record";

interface RunRecordStage {
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
	readonly readManifestJudgment?: {
		readonly state: "unavailable";
		readonly reasons: readonly string[];
	};
	readonly artifactsIn: ArtifactsIn;
	readonly artifactsOut: ArtifactsOut;
}

type ShortIdReading = Reading<{ readonly shortId: string }>;

type PathsReading = Reading<{ readonly paths: readonly string[] }>;

interface WorkflowStateChange {
	readonly path: string;
	readonly change: "added" | "modified" | "removed";
}

interface ArtifactsOut {
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
type ArtifactIn =
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
interface ArtifactsIn {
	readonly entries: readonly ArtifactIn[];
	readonly missing: readonly MissingPart[];
}

/**
 * The final judge's recorded outcome, which the design calls the task grade.
 * The judge returns PASS or FAIL and no letter, so none is served.
 */
type FinalOutcome =
	| { readonly status: "JUDGED"; readonly verdict: "PASS" | "FAIL" }
	| { readonly status: "JUDGING_FAILED"; readonly reason: string }
	| {
			readonly status: "NOT_REACHED";
			readonly stage?: string | undefined;
			readonly reason: string;
	  }
	| { readonly status: "PENDING"; readonly stage: string };

interface CostPart {
	readonly part: string;
	readonly usd: number;
}

/** Every recorded spend summed, naming each part summed and each lacked. */
type CostReading = Reading<{
	readonly usd: number;
	readonly parts: readonly CostPart[];
	readonly missing: readonly MissingPart[];
}>;

type WallTimeReading = Reading<{ readonly ms: number }>;

interface RunTotals {
	readonly tokens: TokenReading;
	readonly cost: CostReading;
	readonly productOwnerCost: Reading<{ readonly usd: number }>;
	readonly wallTime: WallTimeReading;
}

/**
 * What the run ran against and with. The target is the source root's
 * directory name, since the absolute path names the operator's machine.
 */
interface RunIdentity {
	readonly target: string;
	readonly commit: string;
	readonly model: string;
	readonly effort: Effort | undefined;
	/** Measured when the run started, before any stage measured its own. */
	readonly corpusVersion: CorpusMeasurement | undefined;
}

interface RunRecord {
	readonly run: string;
	readonly shortId: ShortIdReading;
	readonly caseId: string;
	readonly identity: RunIdentity;
	readonly status: Reading<{ readonly status: string }>;
	readonly minimumGrade: Reading<{ readonly letter: string }>;
	readonly stages: readonly RunRecordStage[];
	readonly totals: RunTotals;
	readonly finalOutcome: FinalOutcome;
	/** Included by the detailed API; the listing does not read review files. */
	readonly humanReview?: Reading<{ readonly review: HumanReview }> | undefined;
}

interface RecordedStage {
	readonly stage: string;
	readonly file: StageFile | undefined;
	readonly checkpoint: CheckpointRecord | undefined;
}

/**
 * Where a stage sits against the stage the run ended or is running in: that
 * stage, one after it, or one before it or in a run whose outcome names none.
 */
type StagePlace = "current" | "unreached" | "elsewhere";

/** A recorded stage and its place in the run. */
interface PlacedStage extends RecordedStage {
	readonly place: StagePlace;
}

/** A run's checkpoints, the initial one included, by lineage. */
type CheckpointsByLineage = ReadonlyMap<string, CheckpointRecord>;

/**
 * Where the run-wide readings live: the main artifact once the final judge
 * ran, else a stop record, which holds them up to the stop.
 */
interface RunWideRecords {
	readonly artifact: ArtifactSpend | undefined;
	readonly stopRecord: StageFile | undefined;
}

export type {
	Reading,
	MissingPart,
	TokenCounts,
	TokenReading,
	StageStatus,
	RunRecordStage,
	ShortIdReading,
	PathsReading,
	WorkflowStateChange,
	ArtifactsOut,
	ArtifactIn,
	ArtifactsIn,
	FinalOutcome,
	CostPart,
	CostReading,
	WallTimeReading,
	RunTotals,
	RunIdentity,
	RunRecord,
	RecordedStage,
	StagePlace,
	PlacedStage,
	CheckpointsByLineage,
	RunWideRecords,
};
