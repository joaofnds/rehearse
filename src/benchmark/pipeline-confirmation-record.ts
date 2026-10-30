import { finalizeConfirmationGroup } from "./confirmation-evidence";
import type { PipelineConfirmationExecution } from "./pipeline-confirmation-execution";
import type { PipelineConfirmationRepResults } from "./pipeline-confirmation-reps";
import type { PipelineConfirmationOutcome } from "./pipeline-confirmation-request";
import type { FrozenPipelineInputs } from "./pipeline-frozen-inputs";

interface PipelineConfirmationRecordInputs {
	readonly execution: PipelineConfirmationExecution;
	readonly frozen: FrozenPipelineInputs;
	readonly results: PipelineConfirmationRepResults;
}
async function finalizePipelineConfirmation({
	execution,
	frozen,
	results,
}: PipelineConfirmationRecordInputs): Promise<PipelineConfirmationOutcome> {
	const { request, paths, worktreesDirectory } = execution;
	const { startedAt, makespanMs, repResults } = results;

	return await finalizeConfirmationGroup({
		approvalMethod: request.approvalMethod,
		caseId: request.caseId,
		declaredStages: request.pipeline.stages.map(({ name }) => name),
		groupDirectory: paths.directory,
		groupFile: paths.groupFile,
		groupId: request.groupId,
		inputs: {
			corpusVersion: frozen.corpusVersion,
			effort: request.effort,
			files: frozen.files,
			judgeEffort: request.judgeEffort,
			judgeModel: request.judgeModel,
			lineage: { kind: "SOURCE", sha: request.source.sha },
			model: request.model,
			pipelinePath: request.pipelinePath,
			sessionBudgetUsd: request.sessionBudgetUsd,
			setup: "actual",
			spendCeilingUsd: request.spendCeilingUsd,
		},
		makespanMs,
		mode: "pipeline",
		operatorStopFile: paths.operatorStopFile,
		projectedCost: request.projectedCost,
		repResults,
		reportFile: paths.reportFile,
		reps: request.reps,
		runsDirectory: request.runsDirectory,
		startedAt,
		worktreesDirectory,
	});
}
export { finalizePipelineConfirmation as default };
