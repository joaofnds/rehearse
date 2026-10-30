import type { ConfirmationRepRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import type { PipelineJudgeRejection } from "./pipeline-judge-rejection";
import writeRejectedStage from "./pipeline-rejected-stage";
import type { PipelineRepFailure } from "./pipeline-rep-failure";
import { liveReadsField } from "./stage-live-reads";

const NEXT_STAGE_INDEX_STEP = 1;
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
			...liveReadsField(state.currentLiveReads),
			stage: failedStage.name,
			status: "EXECUTION_FAILED",
			...(evidence === undefined
				? { worktreePath: plan.worktreePath }
				: { evidence }),
		},
		...request.pipeline.stages
			.slice(currentStageIndex + NEXT_STAGE_INDEX_STEP)
			.map((stage) => ({
				reason: `${failedStage.name} execution failed`,
				stage: stage.name,
				status: "NOT_REACHED" as const,
			})),
	];
	const finalOutcome: ConfirmationRepRecord["finalOutcome"] = {
		reason: `${failedStage.name} execution failed`,
		status: "NOT_REACHED",
	};

	return { finalOutcome, stages };
}
export { failedStageOutcomes as default };
