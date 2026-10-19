import type { PipelineConfirmationExecution } from "./pipeline-confirmation-execution";
import finalizePipelineConfirmation from "./pipeline-confirmation-record";
import executePipelineConfirmationReps from "./pipeline-confirmation-reps";
import type { PipelineConfirmationOutcome } from "./pipeline-confirmation-request";
import freezePipelineInputs from "./pipeline-input-freeze";
import { claimShortId } from "./short-id";

async function confirmPipelineGroup(
	execution: PipelineConfirmationExecution,
): Promise<PipelineConfirmationOutcome> {
	const { request, paths, worktreesDirectory } = execution;
	const frozen = await freezePipelineInputs(execution.dependencies, request, {
		groupDirectory: paths.directory,
		inputsDirectory: paths.inputsDirectory,
		worktreesDirectory,
	});

	await claimShortId(request.runsDirectory, request.caseId, {
		groupId: request.groupId,
		kind: "group",
	});

	const results = await executePipelineConfirmationReps(execution, frozen);

	return await finalizePipelineConfirmation({
		execution,
		frozen,
		results,
	});
}
export { confirmPipelineGroup as default };
