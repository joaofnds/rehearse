import { mkdir } from "node:fs/promises";

import type { ConfirmationRepResult } from "./confirmation-evidence";
import type { PipelineConfirmationDependencies } from "./pipeline-confirmation-dependencies";
import PipelineRepEvidence from "./pipeline-rep-evidence";
import type {
	PipelineRepContext,
	PipelineRepRuntime,
} from "./pipeline-rep-execution";
import PipelineRepProgress from "./pipeline-rep-progress";
import executePipelineRep from "./pipeline-rep-runner";

async function runPipelineRep(
	dependencies: PipelineConfirmationDependencies,
	context: PipelineRepContext,
	runtime: PipelineRepRuntime,
): Promise<ConfirmationRepResult> {
	const { now } = runtime;
	const repPaths = context.paths.rep(context.plan.repId);

	await mkdir(repPaths.stagesDirectory, { recursive: true });

	const repStart = now();
	const scope = { context, dependencies, repPaths, repStart, runtime };
	const evidence = new PipelineRepEvidence(scope);
	const progress = new PipelineRepProgress(now);

	return await executePipelineRep({ evidence, progress, scope });
}
export { runPipelineRep as default };
