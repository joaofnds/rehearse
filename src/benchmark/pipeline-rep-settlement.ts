import type { ConfirmationRepResult } from "./confirmation-evidence";
import {
	settleCompletedConfirmationRep,
	settleDiagnosticConfirmationRep,
} from "./confirmation-evidence";
import type { ConfirmationRepRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import type { PipelineConfirmationDependencies } from "./pipeline-confirmation-dependencies";
import type { PipelineConfirmationRequest } from "./pipeline-confirmation-request";
import type { PipelineRepPlan } from "./pipeline-rep-execution";
import type { ConfirmationRepPaths } from "./run-layout";

const RECORD_JSON_INDENT_SPACES = 2;
interface PipelineRepSettlement {
	readonly dependencies: PipelineConfirmationDependencies;
	readonly request: PipelineConfirmationRequest;
	readonly repPaths: ConfirmationRepPaths;
	readonly plan: PipelineRepPlan;
}
async function settleCompletedPipelineRep(
	{ dependencies, request, repPaths, plan }: PipelineRepSettlement,
	record: Immutable<ConfirmationRepRecord>,
	resultSha: string,
): Promise<ConfirmationRepResult> {
	return await settleCompletedConfirmationRep({
		recordContent: `${JSON.stringify(record, null, RECORD_JSON_INDENT_SPACES)}\n`,
		recordFile: repPaths.recordFile,
		recordRetentionRef: dependencies.recordRetentionRef,
		removeWorktree: dependencies.removeWorktree,
		resultSha,
		retentionName: `${request.groupId}/${plan.repId}`,
		targetRoot: request.source.root,
		worktreePath: plan.worktreePath,
	});
}
async function settleDiagnosticPipelineRep(
	{ dependencies, repPaths, plan }: PipelineRepSettlement,
	record: Immutable<ConfirmationRepRecord>,
	worktreeCreated: boolean,
): Promise<ConfirmationRepResult> {
	return await settleDiagnosticConfirmationRep({
		log: dependencies.log,
		preservedMessage: `Pipeline rep ${plan.repId} failed; evidence preserved at ${plan.worktreePath}`,
		recordContent: `${JSON.stringify(record, null, RECORD_JSON_INDENT_SPACES)}\n`,
		recordFile: repPaths.recordFile,
		worktreeCreated,
	});
}
export { settleCompletedPipelineRep, settleDiagnosticPipelineRep };
