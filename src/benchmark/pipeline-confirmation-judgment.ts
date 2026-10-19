import type { Effort } from "./config";
import type { ContextFile, StageScorecard } from "./contracts";
import type { JudgeBudget } from "./judge-attempt";
import type { LoadedStageRubric } from "./pipeline-confirmation-request";
import type { BuildEvidence } from "./run-artifact";
import type { SpendCeiling } from "./spend-ceiling";

interface PipelineFinalJudgeRequest {
	readonly repId: string;
	readonly ordinal: number;
	readonly resultSha: string;
	readonly rubric: string;
	readonly baselineContext: readonly ContextFile[];
	readonly evidence: BuildEvidence;
	readonly spendCeiling: SpendCeiling;
}

interface PipelineJudgeExecution {
	readonly model: string;
	readonly effort: Effort | undefined;
	readonly budget: JudgeBudget;
}

interface PipelineStageJudgment {
	readonly input: StageScorecard["input"];
	readonly source: LoadedStageRubric;
}
export type {
	PipelineFinalJudgeRequest,
	PipelineJudgeExecution,
	PipelineStageJudgment,
};
