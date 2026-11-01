import type { ConfirmationRepRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import judgeFailureContract from "./judge-failure-contract";
import type { PipelineJudgeRejection } from "./pipeline-judge-rejection";
import writeRejectedStage from "./pipeline-rejected-stage";
import type { PipelineRepFailure } from "./pipeline-rep-failure";
import { liveReadsField } from "./stage-live-reads";

const NEXT_STAGE_INDEX_STEP = 1;
function notReachedStages(
	state: PipelineRepFailure,
	failedStage: string,
): Immutable<ConfirmationRepRecord["stages"]> {
	return state.request.pipeline.stages
		.slice(state.currentStageIndex + NEXT_STAGE_INDEX_STEP)
		.map((stage) => ({
			reason: `${failedStage} execution failed`,
			stage: stage.name,
			status: "NOT_REACHED" as const,
		}));
}
async function failedStageOutcomes(
	state: PipelineRepFailure,
	rejection: PipelineJudgeRejection,
): Promise<Immutable<Pick<ConfirmationRepRecord, "stages" | "finalOutcome">>> {
	const { request, plan, stageOutcomes, currentStageIndex, now } = state;
	const { judgeFailure, completedJudgeRejection, errorOptions } = rejection;
	const diagnosticError =
		state.setupOperation === undefined
			? state.failure.message
			: `${state.setupOperation} failed: ${state.failure.message}`;
	const failedStage = request.pipeline.stages[currentStageIndex];
	if (failedStage === undefined) {
		throw new Error("Pipeline must declare at least one stage", errorOptions);
	}

	const evidence =
		completedJudgeRejection && judgeFailure !== undefined
			? await writeRejectedStage({
					judgeFailure,
					stage: failedStage,
					state,
				})
			: undefined;
	const stages: Immutable<ConfirmationRepRecord["stages"]> = [
		...stageOutcomes,
		{
			elapsedMs: now() - (state.stageClock.read() ?? state.repStart),
			error: diagnosticError,
			judgeContractSha256: state.judgingStage
				? judgeFailureContract(state.failure)
				: undefined,
			...liveReadsField(state.currentLiveReads),
			stage: failedStage.name,
			status: "EXECUTION_FAILED",
			...(evidence === undefined
				? { worktreePath: plan.worktreePath }
				: { evidence }),
		},
		...notReachedStages(state, failedStage.name),
	];
	return {
		finalOutcome: {
			reason: `${failedStage.name} execution failed`,
			status: "NOT_REACHED",
		},
		stages,
	};
}
export { failedStageOutcomes as default };
