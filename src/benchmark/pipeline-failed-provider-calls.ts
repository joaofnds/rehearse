import type { ConfirmationProviderCalls } from "./confirmation-evidence";
import type { JudgeOutputValidationError } from "./judge-attempt";
import { JudgeExecutionError } from "./judge-attempt";
import JudgeCeilingStopError from "./judge-ceiling-stop-error";
import type { PipelineRepFailure } from "./pipeline-rep-failure";
import StageSessionError from "./stage-session-error";

function paidJudgeFailure(
	failure: Readonly<Error>,
): Readonly<JudgeExecutionError> | Readonly<JudgeCeilingStopError> | undefined {
	return failure instanceof JudgeExecutionError ||
		failure instanceof JudgeCeilingStopError
		? failure
		: undefined;
}
function failedProviderCalls(
	state: PipelineRepFailure,
	judgeFailure: Readonly<JudgeOutputValidationError> | undefined,
	completedJudgeRejection: boolean,
): ConfirmationProviderCalls {
	const paid = paidJudgeFailure(state.failure);
	const failedWorker =
		state.failure instanceof StageSessionError
			? state.failure.providerCalls
			: [];
	const missingWorker =
		!(state.failure instanceof StageSessionError) &&
		state.stageClock.read() !== undefined &&
		state.currentSession === undefined
			? [{}]
			: [];
	const failedJudge =
		state.judgingStage && paid !== undefined ? paid.providerCalls : [];
	const missingJudge =
		state.judgingStage && paid === undefined && judgeFailure === undefined
			? [{}]
			: [];
	const rejectedJudge =
		!state.judgingFinal && completedJudgeRejection && judgeFailure !== undefined
			? judgeFailure.attempts
			: [];

	return {
		finalJudge: state.judgingFinal
			? (paid?.providerCalls ?? judgeFailure?.attempts ?? [])
			: undefined,
		productOwner: state.productOwner?.snapshot().providerCalls,
		stageJudge: [
			...state.stageJudgeCalls,
			...failedJudge,
			...missingJudge,
			...rejectedJudge,
		],
		worker: [...state.workerCalls, ...failedWorker, ...missingWorker],
	};
}
export { failedProviderCalls as default };
