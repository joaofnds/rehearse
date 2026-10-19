import type { Effort, WorkflowStage } from "./config";
import type {
	CalibrationResult,
	ContextFile,
	StageJudgeRecord,
	StageLetterGrade,
	StageScorecard,
} from "./contracts";
import type { CorpusRoot } from "./corpus-file";
import type {
	JudgeAgreementCalibration,
	JudgeAgreementReport,
} from "./judge-agreement";
import type { PipelineDefinition } from "./pipeline";
import type { CeilingStop, PendingStage } from "./run-abort";
import type { RunEventRecorder } from "./run-events";
import type { SpendCeiling } from "./spend-ceiling";
import type { LoadedStageSettings } from "./stage-settings";
import type { ProductOwner } from "./workflow";

interface StageContext {
	readonly corpusSource: CorpusRoot;
	readonly targetDir: string;
	readonly initialLineage: string;
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly spendCeiling: SpendCeiling;
	readonly minimumStageGrade?: StageLetterGrade | undefined;
	readonly productOwner: ProductOwner;
	readonly task: string;
	readonly productBrief: string;
	readonly instructions: string;
	readonly baselineContext: readonly ContextFile[];
	readonly baselineHashes: ReadonlyMap<string, string>;
	readonly taskId: string;
	readonly taskSha: string;
	readonly pipeline: PipelineDefinition;
	readonly loadedSettings: LoadedStageSettings;
	readonly stageFile: (stage: WorkflowStage) => string;
	readonly checkpointDirectory: (stage: WorkflowStage) => string;
	readonly stoppedSessionDirectory: (stage: WorkflowStage) => string;
	/**
	 * Where the provider writes session transcripts. Injected rather than read
	 * from the environment so a test can point it at a fixture, and optional so
	 * a caller that does not supply it records no transcript instead of
	 * guessing at the operator's home directory.
	 */
	readonly projectsDirectory?: string | undefined;
	readonly writePendingStage: (pending: PendingStage) => Promise<void>;
	readonly updatePendingStage: (pending: PendingStage) => void;
	readonly stopAtCeiling: (stop: CeilingStop) => void;
	readonly reportError: (message: string) => void;
	readonly writeStageProgress: (record: StageJudgeRecord) => Promise<void>;
	readonly completeStage: (record: StageJudgeRecord) => Promise<void>;
	readonly calibrateStageFailure: (
		stageScorecards: readonly StageScorecard[],
	) => Promise<CalibrationResult | undefined>;
	readonly collectJudgeAgreement: (
		currentCalibrations: readonly JudgeAgreementCalibration[],
	) => Promise<JudgeAgreementReport>;
	readonly runEvents?: RunEventRecorder | undefined;
	readonly elapsedMs?: (() => number) | undefined;
	/**
	 * Whether the operator asked the run to pause after the stage now running.
	 * Asked once a stage's checkpoint is written and another stage remains.
	 */
	readonly pauseRequested?: (() => Promise<boolean>) | undefined;
}

/**
 * A run the operator paused: its last stage finished, was judged and wrote
 * its checkpoint, and no further stage starts. It is an ending of its own,
 * neither a failure nor a stop below the minimum grade.
 */
class RunPausedError extends Error {
	public readonly stage: string;

	public constructor(stage: string) {
		super(`Run paused after the ${stage} stage, as the operator asked.`);
		this.name = "RunPausedError";
		this.stage = stage;
	}
}

export { RunPausedError as default };

export type { StageContext };
