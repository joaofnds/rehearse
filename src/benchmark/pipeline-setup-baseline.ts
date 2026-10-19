import type {
	FrozenPipelineInputs,
	PipelineInputExecution,
} from "./pipeline-frozen-inputs";
import {
	checksWithServices,
	setupWithServices,
	startTargetServices,
} from "./target-services";
import type { TargetServices } from "./target-services";

interface PipelineSetupBaseline extends PipelineInputExecution {
	readonly setupWorktree: string;
	readonly services: TargetServices;
}
async function preparePipelineBaseline({
	dependencies,
	request,
	setupWorktree,
	services,
}: PipelineSetupBaseline): Promise<
	Pick<FrozenPipelineInputs, "baselineHashes" | "baselineContext">
> {
	const environment = await startTargetServices(
		services,
		request.pipeline.target,
	);

	await dependencies.runSetup(
		setupWorktree,
		setupWithServices(request.pipeline.target.setup, environment),
		dependencies.log,
	);

	await dependencies.runChecks(
		setupWorktree,
		{
			checks: checksWithServices(request.pipeline.target.checks, environment),
			label: "Baseline checks",
		},
		dependencies.log,
	);

	const baselineHashes = await dependencies.captureFileHashes(
		setupWorktree,
		request.pipeline.target.integrityFiles,
	);
	const baselineContext =
		await dependencies.captureBaselineContext(setupWorktree);

	return { baselineContext, baselineHashes };
}
export { preparePipelineBaseline as default };
