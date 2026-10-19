import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import type { ReplayRecord } from "#benchmark/replay";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import type { AttemptPosition } from "#server/checkpoint-attempts";
import type { RowStaleness } from "#server/row-staleness";
import type {
	CostReading,
	FinalOutcome,
	Reading,
	RunRecordStage,
	WallTimeReading,
} from "#server/run-record";
import type { ContextLink, RunProgress } from "#server/run-status";
import type { SavedStateAssessment } from "#server/saved-state-assessment";

/**
 * One pipeline run's row, in decision-5's code vocabulary (`run`, `caseId`,
 * `stage`), never the design's task/step labels. `caseId` is undefined only
 * for a run whose status comes from its events and whose manifest was never
 * written: the event table has no case column.
 */
interface PipelineRunRow {
	/** The id `lastEdit.rows` and the `ids` filter name the record by. */
	readonly recordId: string;
	readonly kind: "run";
	readonly run: string;
	readonly shortId: string | undefined;
	/** The short id of each checkpoint the run recorded, earliest first. */
	readonly checkpoints: readonly CheckpointShortId[];
	/** The stages a replay can start, in pipeline order, by the launch's own rule. */
	readonly replayableStages: readonly string[];
	readonly caseId: string | undefined;
	readonly status: string;
	readonly stage: string | undefined;
	readonly grade: string | undefined;
	/** The version its latest checkpoint measured; undefined when none recorded one. */
	readonly corpusVersion: CorpusMeasurement | undefined;
	/** Whether its checkpoints measured more than one corpus version. */
	readonly corpusChangedDuringRun: boolean;
	readonly staleness: RowStaleness;
	readonly progress: RunProgress;
	readonly links: readonly ContextLink[];
	readonly stageGrades: Reading<{
		readonly grades: readonly ListedStageGrade[];
	}>;
	/** The final judge's outcome, the design's task grade, with its note. */
	readonly finalOutcome: Reading<FinalOutcome>;
	readonly cost: CostReading;
	readonly wallTime: WallTimeReading;
	/** The grade a stage had to reach for the run to go on past it. */
	readonly minimumGrade: Reading<{ readonly letter: string }>;
	readonly firedBlockers: FiredBlockers;
	/** The browser launch whose process holds its target, which a stop names. */
	readonly launchId: string | undefined;
}

/**
 * The id of each hard blocker a record's stage judges found fired, which the
 * operator searches the history by.
 */
type FiredBlockers = Reading<{ readonly ids: readonly string[] }>;

/** A pipeline's stage names in order, where a record names them. */
type PipelineStages = Reading<{ readonly stages: readonly string[] }>;

/** A stage's grade as the run's step grades column shows it. */
interface ListedStageGrade {
	readonly stage: string;
	readonly status: RunRecordStage["status"] | "not-run";
	readonly grade: RunRecordStage["grade"];
}

interface SessionAttemptRow {
	/** The id `lastEdit.rows` and the `ids` filter name the record by. */
	readonly recordId: string;
	readonly kind: "session-attempt";
	readonly caseId: string;
	readonly uuid: string;
	readonly shortId: string | undefined;
	readonly status: SessionAttemptRecord["outcome"];
	/** When the attempt started; undefined for a record written before attempts recorded it. */
	readonly startedAt: string | undefined;
	readonly corpusVersion: CorpusMeasurement | undefined;
	readonly staleness: RowStaleness;
	readonly links: readonly ContextLink[];
	readonly cost: CostReading;
	readonly wallTime: WallTimeReading;
	/** Of the checks its case declared, how many passed: its grade. */
	readonly checks: Reading<{
		readonly passed: number;
		readonly declared: number;
	}>;
	/** Optional for clients retaining a historical API response. Never changes recorded outcome. */
	readonly savedState?: SavedStateAssessment | undefined;
}

/**
 * One stage replayed from a checkpoint. Its case is the source run's, read
 * from that run's manifest, and is undefined when the manifest is gone. Its
 * context opens only under the lineage it consumed, the one identity the
 * replay history reader accepts for it.
 */
interface ReplayRow {
	/** The id `lastEdit.rows` and the `ids` filter name the record by. */
	readonly recordId: string;
	readonly kind: "replay";
	readonly lineage: string;
	readonly timestamp: string;
	readonly shortId: string | undefined;
	/** The short id of the checkpoint the replay started from. */
	readonly checkpointShortId: string | undefined;
	readonly attempt: AttemptPosition | undefined;
	readonly caseId: string | undefined;
	readonly stage: string;
	readonly grade: string;
	readonly status: ReplayRecord["scorecard"]["grade"]["verdict"];
	readonly corpusVersion: CorpusMeasurement | undefined;
	readonly staleness: RowStaleness;
	readonly links: readonly ContextLink[];
	readonly cost: CostReading;
	readonly finalOutcome: NotApplicable;
	readonly wallTime: WallTimeReading;
	/** The source run's stages, among which `stage` is placed. */
	readonly pipelineStages: PipelineStages;
	readonly firedBlockers: FiredBlockers;
}

/** A figure that has no meaning for a row's kind, rather than one not recorded. */
interface NotApplicable {
	readonly state: "available";
	readonly status: "NOT_APPLICABLE";
	readonly reason: string;
}

interface CheckpointShortId {
	readonly stage: string;
	readonly shortId: string;
}

interface RunFigures {
	readonly stageGrades: PipelineRunRow["stageGrades"];
	readonly finalOutcome: PipelineRunRow["finalOutcome"];
	readonly cost: PipelineRunRow["cost"];
	readonly wallTime: PipelineRunRow["wallTime"];
	readonly minimumGrade: PipelineRunRow["minimumGrade"];
	readonly firedBlockers: FiredBlockers;
	readonly corpusVersion: PipelineRunRow["corpusVersion"];
	readonly corpusChangedDuringRun: boolean;
}

export type {
	PipelineRunRow,
	FiredBlockers,
	PipelineStages,
	ListedStageGrade,
	SessionAttemptRow,
	ReplayRow,
	NotApplicable,
	CheckpointShortId,
	RunFigures,
};
export type {
	RunLivenessContext,
	RunRowIdentity,
	RunRowLiveness,
	ReplayRowIdentity,
	ReplayRowIndexes,
} from "#server/run-history-reader-contract";
