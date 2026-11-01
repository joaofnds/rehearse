import {
	JudgeExecutionError,
	JudgeOutputValidationError,
} from "./judge-attempt";
import JudgeCeilingStopError from "./judge-ceiling-stop-error";
import type { SessionJudgeRecord } from "./session-judge-contract";

type SessionJudgeRecordBase = Omit<
	SessionJudgeRecord,
	"status" | "grade" | "detail"
>;

function sessionJudgeFailure(
	base: SessionJudgeRecordBase,
	error: Readonly<Error>,
): SessionJudgeRecord {
	if (
		!(
			error instanceof JudgeExecutionError ||
			error instanceof JudgeOutputValidationError ||
			error instanceof JudgeCeilingStopError
		)
	) {
		throw new Error(error.message, { cause: error });
	}

	return {
		...base,
		attempts: error.attempts,
		costUsd: error.costUsd,
		detail: error.message,
		judgeContractSha256: error.judgeContractSha256,
		providerCalls: error.providerCalls,
		status: "ERROR",
	};
}

export { sessionJudgeFailure as default };
export type { SessionJudgeRecordBase };
