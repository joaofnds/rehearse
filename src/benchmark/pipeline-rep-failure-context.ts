import type { ConfirmationRepResult } from "./confirmation-evidence";
import failedPipelineRep from "./pipeline-failed-rep";
import type { PipelineRepExecutionState } from "./pipeline-rep-state";

async function failPipelineRep(
	{ scope, progress, evidence }: PipelineRepExecutionState,
	errorOptions: Readonly<ErrorOptions>,
): Promise<ConfirmationRepResult> {
	const { context, runtime } = scope;
	const { cause: error } = errorOptions;
	const stage = context.frozen.stages[progress.currentStageIndex];
	const recorded = evidence.stageOutcomes.some(
		(outcome) => outcome.stage === stage?.definition.name,
	);
	const currentLiveReads =
		progress.currentSession === undefined || stage === undefined || recorded
			? undefined
			: await evidence.liveReads(stage, progress.currentSession);

	return await failedPipelineRep(
		{
			currentLiveReads,
			currentSession: progress.currentSession,
			currentStageIndex: progress.currentStageIndex,
			dependencies: scope.dependencies,
			failure: error instanceof Error ? error : new Error(String(error)),
			judgedReads: progress.judgedReads,
			judgingFinal: progress.judgingFinal,
			judgingStage: progress.judgingStage,
			now: runtime.now,
			plan: context.plan,
			productOwner: progress.productOwner,
			repPaths: scope.repPaths,
			repStart: scope.repStart,
			request: context.request,
			resultSha: evidence.resultSha,
			setupOperation: progress.setupOperation,
			stageClock: progress.stageClock,
			stageJudgeCalls: evidence.stageJudgeCalls,
			stageOutcomes: evidence.stageOutcomes,
			workerCalls: evidence.workerCalls,
			worktreeCreated: progress.worktreeCreated,
		},
		errorOptions,
	);
}
export { failPipelineRep as default };
