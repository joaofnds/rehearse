import type { HashedFile } from "./checkpoint";
import type { Effort, WorkflowStage } from "./config";
import type {
	ProviderCall,
	StageJudgeInput,
	StageLetterGrade,
	StageScorecard,
} from "./contracts";
import type { CorpusMeasurement } from "./corpus-measurement";
import type { JudgeAttempt } from "./judge-attempt";
import type { ReadManifestEntry } from "./read-manifest";
import type { CeilingReached } from "./spend-ceiling";
import type { SessionSpend } from "./stage-session-error";
import type { ProductOwnerSnapshot } from "./workflow";

interface PendingStage {
	readonly file: string;
	readonly stage: WorkflowStage;
	readonly input: StageJudgeInput;
	readonly model?: string | undefined;
	readonly effort?: Effort | undefined;
	readonly judgeModel?: string | undefined;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd?: number | undefined;
	readonly corpusFiles?: readonly HashedFile[] | undefined;
	readonly corpusVersion?: CorpusMeasurement | undefined;
	readonly readManifest?: readonly ReadManifestEntry[] | undefined;
	readonly failure?:
		| {
				readonly prompt: string;
				readonly attempts: readonly JudgeAttempt[];
				readonly judgeProviderCalls: readonly ProviderCall[];
				readonly costUsd: number;
		  }
		| undefined;
	readonly scorecard?: StageScorecard | undefined;
	readonly stopped?: StoppedStageReadings | undefined;
	readonly ceilingStop?: CeilingStopReadings | undefined;
	/** The Product Owner's spend up to a stop, which no other record holds. */
	readonly productOwner?: ProductOwnerSnapshot | undefined;
	readonly operatorStop?: OperatorStop | undefined;
}

interface OperatorStop {
	readonly signal: NodeJS.Signals;
}

type CeilingStopReadings = CeilingReached;

interface CeilingStop extends CeilingStopReadings {
	readonly file: string;
	readonly stage: string;
	readonly session?: SessionSpend | undefined;
	readonly productOwner: ProductOwnerSnapshot;
}

interface StoppedStageReadings {
	readonly minimumGrade: StageLetterGrade;
	readonly elapsedMs?: number | undefined;
	readonly runElapsedMs?: number | undefined;
}

export type {
	PendingStage,
	OperatorStop,
	CeilingStopReadings,
	CeilingStop,
	StoppedStageReadings,
};
