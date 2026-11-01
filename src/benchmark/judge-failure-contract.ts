import JudgeOutputValidationError from "./judge-attempt-contract";
import JudgeCeilingStopError from "./judge-ceiling-stop-error";
import { JudgeExecutionError } from "./judge-execution-error";

function judgeFailureContract(error: Readonly<Error>): string | undefined {
	return error instanceof JudgeOutputValidationError ||
		error instanceof JudgeCeilingStopError ||
		error instanceof JudgeExecutionError
		? error.judgeContractSha256
		: undefined;
}

export { judgeFailureContract as default };
