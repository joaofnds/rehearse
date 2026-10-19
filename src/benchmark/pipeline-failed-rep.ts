import type {
	ConfirmationProviderCalls,
	ConfirmationRepResult,
} from "./confirmation-evidence";
import { collectConfirmationMetrics } from "./confirmation-evidence";
import type { ConfirmationRepRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import { JudgeOutputValidationError } from "./judge-attempt";
import failedFinalOutcome from "./pipeline-failed-final";
import failedProviderCalls from "./pipeline-failed-provider-calls";
import failedStageOutcomes from "./pipeline-failed-stages";
import type { PipelineRepFailure } from "./pipeline-rep-failure";
import pipelineRepRecord from "./pipeline-rep-record";
import {
	settleCompletedPipelineRep,
	settleDiagnosticPipelineRep,
} from "./pipeline-rep-settlement";

async function failedPipelineRep(
	state: PipelineRepFailure,
	errorOptions: Readonly<ErrorOptions>,
): Promise<ConfirmationRepResult> {
	const { failure, currentSession, worktreeCreated } = state;
	const judgeFailure =
		failure instanceof JudgeOutputValidationError ? failure : undefined;
	const completedJudgeRejection =
		judgeFailure !== undefined &&
		worktreeCreated &&
		state.productOwner !== undefined &&
		(state.judgingFinal || currentSession !== undefined);

	const outcome = state.judgingFinal
		? {
				finalOutcome: await failedFinalOutcome(
					state,
					judgeFailure,
					completedJudgeRejection,
				),
				stages: state.stageOutcomes,
			}
		: await failedStageOutcomes(state, {
				completedJudgeRejection,
				errorOptions,
				judgeFailure,
			});

	const calls = failedProviderCalls(
		state,
		judgeFailure,
		completedJudgeRejection,
	);
	const record = failedPipelineRecord({ calls, outcome, state });

	if (completedJudgeRejection) {
		return await settleCompletedPipelineRep(
			state,
			record,
			currentSession?.resultSha ?? state.resultSha,
		);
	}

	return await settleDiagnosticPipelineRep(state, record, worktreeCreated);
}
interface FailedPipelineRecordInput {
	readonly state: PipelineRepFailure;
	readonly calls: ConfirmationProviderCalls;
	readonly outcome: Immutable<
		Pick<ConfirmationRepRecord, "stages" | "finalOutcome">
	>;
}
function failedPipelineRecord({
	state,
	calls,
	outcome,
}: FailedPipelineRecordInput): ConfirmationRepRecord {
	const evidence = collectConfirmationMetrics(calls);
	return pipelineRepRecord({
		elapsedMs: state.now() - state.repStart,
		evidence,
		finalOutcome: outcome.finalOutcome,
		plan: state.plan,
		request: state.request,
		stages: outcome.stages,
		successful: false,
	});
}
export { failedPipelineRep as default };
