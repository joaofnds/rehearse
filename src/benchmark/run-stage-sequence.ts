import type { PreparedRunExecution } from "./run-execution-context";
import runGradedStages from "./run-graded-stages";
import { pauseRequested } from "./run-pause";
import type RunReview from "./run-review";
import type { StageDependencies, StageOutcome } from "./run-stage-contract";
import { claudeProjectsDirectory } from "./session-capture";

interface RunStageSequenceRequest extends PreparedRunExecution {
	readonly review: Readonly<RunReview>;
}
async function executeRunStageSequence(
	dependencies: StageDependencies,
	{ execution, prepared, review }: RunStageSequenceRequest,
): Promise<StageOutcome> {
	const { config, loadedSettings } = execution.inputs;
	const { files } = execution.identity;
	const { abort, elapsedMs, events } = execution.lifetime;
	const { corpus, task, initialCheckpoint, productOwner } = prepared.evidence;
	return await runGradedStages(dependencies, {
		baselineContext: prepared.target.baseline.baselineContext,
		baselineHashes: prepared.target.baseline.baselineHashes,
		calibrateStageFailure: review.calibrateStageFailure,
		checkpointDirectory: files.checkpointDirectory,
		collectJudgeAgreement: review.collectJudgeAgreement,
		completeStage: abort.completeStage,
		corpusSource: corpus.source,
		effort: config.effort,
		elapsedMs,
		initialLineage: initialCheckpoint.lineage,
		instructions: corpus.instructions,
		judgeEffort: config.judgeEffort,
		judgeModel: config.judgeModel,
		loadedSettings,
		minimumStageGrade: config.minimumStageGrade,
		model: config.model,
		pauseRequested: async () => await pauseRequested(files),
		pipeline: execution.pipeline,
		productBrief: task.productBrief,
		productOwner,
		projectsDirectory: claudeProjectsDirectory(),
		reportError: execution.output.log,
		runEvents: events,
		sessionBudgetUsd: config.sessionBudgetUsd,
		spendCeiling: execution.spendCeiling,
		stageFile: files.stageFile,
		stopAtCeiling: abort.stopAtCeiling,
		stoppedSessionDirectory: files.stoppedSessionDirectory,
		targetDir: execution.source.root,
		task: task.task,
		taskId: task.taskId,
		taskSha: task.taskSha,
		updatePendingStage: abort.updatePendingStage,
		writePendingStage: abort.writePendingStage,
		writeStageProgress: abort.writeStageProgress,
	});
}
export { executeRunStageSequence as default };
export type { RunStageSequenceRequest };
