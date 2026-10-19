import type { JudgeOutputValidationError } from "./judge-attempt";

interface PipelineJudgeRejection {
	readonly judgeFailure: Readonly<JudgeOutputValidationError> | undefined;
	readonly completedJudgeRejection: boolean;
	readonly errorOptions: Readonly<ErrorOptions>;
}

export type { PipelineJudgeRejection };
