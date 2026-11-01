import { inheritedConfiguration } from "./claude-launch-environment";
import { finalizeConfirmationGroup } from "./confirmation-evidence";
import { HOME_PATH_DELIVERY_RULE, NOTHING_DELIVERED } from "./corpus-delivery";
import type { CorpusDelivery } from "./corpus-delivery";
import {
	FINAL_JUDGE_CONTRACT_SHA256,
	STAGE_JUDGE_CONTRACT_SHA256,
} from "./judge-contract";
import type { PipelineConfirmationExecution } from "./pipeline-confirmation-execution";
import type { PipelineConfirmationRepResults } from "./pipeline-confirmation-reps";
import type { PipelineConfirmationOutcome } from "./pipeline-confirmation-request";
import type { FrozenPipelineInputs } from "./pipeline-frozen-inputs";
import CONFIRMATION_STAGE_SETUP from "./stage-session-contract";

/**
 * Each stage installs its own snapshot, so the group's count is the sum of
 * what one install of each stage redirects.
 */
function pipelineCorpusDelivery(frozen: FrozenPipelineInputs): CorpusDelivery {
	return {
		redirected: frozen.stages.reduce(
			(total, { corpusDelivery }) => total + corpusDelivery.delivery.redirected,
			NOTHING_DELIVERED.redirected,
		),
		rule: HOME_PATH_DELIVERY_RULE,
	};
}

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
			corpusDelivery: pipelineCorpusDelivery(frozen),
			corpusVersion: frozen.corpusVersion,
			effort: request.effort,
			files: frozen.files,
			finalJudgeContractSha256: FINAL_JUDGE_CONTRACT_SHA256,
			inheritedConfiguration: inheritedConfiguration(Bun.env),
			judgeContractSha256: STAGE_JUDGE_CONTRACT_SHA256,
			judgeEffort: request.judgeEffort,
			judgeModel: request.judgeModel,
			lineage: { kind: "SOURCE", sha: request.source.sha },
			model: request.model,
			pipelinePath: request.pipelinePath,
			sessionBudgetUsd: request.sessionBudgetUsd,
			setup: CONFIRMATION_STAGE_SETUP,
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
