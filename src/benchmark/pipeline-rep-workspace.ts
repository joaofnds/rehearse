import { join } from "node:path";

import type { PipelineRepResources } from "./pipeline-rep-execution";
import type { PipelineRepExecutionState } from "./pipeline-rep-state";
import { setupWithServices, startTargetServices } from "./target-services";
import type { ServiceEnvironment } from "./target-services";
import type { ProductOwner } from "./workflow";

async function createPipelineRepWorktree({
	scope,
	progress,
}: PipelineRepExecutionState): Promise<ServiceEnvironment> {
	const { dependencies, context, runtime } = scope;

	await dependencies.addWorktree(
		context.request.source.root,
		context.frozen.taskSha,
		context.plan.worktreePath,
	);
	progress.worktreeAdded();

	return await startTargetServices(
		runtime.services,
		context.request.pipeline.target,
	);
}
async function preparePipelineRepWorkspace(
	state: PipelineRepExecutionState,
): Promise<ServiceEnvironment> {
	const { scope, progress } = state;
	const { dependencies, context } = scope;

	const environment = await createPipelineRepWorktree(state);

	progress.beginSetup("target setup");
	await dependencies.runSetup(
		context.plan.worktreePath,
		setupWithServices(context.request.pipeline.target.setup, environment),
		dependencies.log,
	);

	progress.beginSetup("checkpoint materialization");
	await dependencies.materializeCheckpoint(
		context.frozen.checkpointDirectory,
		context.plan.worktreePath,
	);
	progress.completeSetup();

	return environment;
}
function createPipelineRepOwner({
	scope,
}: PipelineRepExecutionState): ProductOwner {
	const { dependencies, context, runtime, repPaths } = scope;
	const { request } = context;

	return dependencies.createProductOwner({
		directory: join(repPaths.directory, "product-owner"),
		effort: request.effort,
		model: request.model,
		productBrief: request.productBrief,
		sessionBudgetUsd: request.sessionBudgetUsd,
		spendCeiling: runtime.spendCeiling,
		task: request.task,
	});
}
async function preparePipelineRep(
	state: PipelineRepExecutionState,
): Promise<PipelineRepResources> {
	const environment = await preparePipelineRepWorkspace(state);
	const productOwner = createPipelineRepOwner(state);

	state.progress.attachProductOwner(productOwner);

	return { environment, productOwner };
}
export { preparePipelineRep as default };
