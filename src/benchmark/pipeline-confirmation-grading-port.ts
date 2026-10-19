import type { StageScorecard } from "./contracts";
import type { JudgeResult } from "./judge";
import type {
	PipelineFinalJudgeRequest,
	PipelineJudgeExecution,
	PipelineStageJudgment,
} from "./pipeline-confirmation-judgment";

interface PipelineConfirmationGrading {
	readonly runStageJudge: (
		execution: PipelineJudgeExecution,
		judgment: PipelineStageJudgment,
	) => Promise<StageScorecard>;
	readonly runFinalJudge: (
		request: PipelineFinalJudgeRequest,
	) => Promise<JudgeResult>;
}
export type { PipelineConfirmationGrading };
