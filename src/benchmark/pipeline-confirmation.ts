import type { PipelineConfirmationDependencies } from "./pipeline-confirmation-dependencies";
import confirmPipelineGroup from "./pipeline-confirmation-group";
import openPipelineConfirmationLifetime from "./pipeline-confirmation-lifetime";
import type {
	PipelineConfirmationOutcome,
	PipelineConfirmationRequest,
} from "./pipeline-confirmation-request";

async function runPipelineConfirmation(
	dependencies: PipelineConfirmationDependencies,
	request: PipelineConfirmationRequest,
): Promise<PipelineConfirmationOutcome> {
	const now = request.now ?? (() => performance.now());
	const lifetime = await openPipelineConfirmationLifetime(
		dependencies,
		request,
	);

	try {
		return await confirmPipelineGroup({
			dependencies: lifetime.dependencies,
			now,
			request,
			...lifetime.resources,
		});
	} catch (error) {
		await lifetime.discard();
		throw error;
	} finally {
		lifetime.close();
	}
}
export { runPipelineConfirmation as default };
export type { PipelineFinalJudgeRequest } from "./pipeline-confirmation-judgment";
export type { PipelineConfirmationDependencies } from "./pipeline-confirmation-dependencies";
export type {
	PipelineConfirmationRequest,
	PipelineConfirmationOutcome,
} from "./pipeline-confirmation-request";
