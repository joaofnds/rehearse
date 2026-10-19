import type {
	ReplayExecutionContext,
	ReplayOutcome,
	ReplayRequest,
} from "./replay-contract";
import type { ReplayDependencies } from "./replay-dependencies";
import ReplayLifetime from "./replay-lifetime";
import { loadReplayInputs } from "./replay-lineage";
import ReplayPreparation from "./replay-preparation";
import ReplayStageExecution from "./replay-stage-execution";

async function executeReplay(
	context: ReplayExecutionContext,
): Promise<ReplayOutcome> {
	const { dependencies, lifetime } = context;
	try {
		const prepared = await new ReplayPreparation(context).run();
		return await new ReplayStageExecution(context, prepared).run();
	} catch (error) {
		dependencies.log(
			`Replay failed; evidence preserved at ${lifetime.worktreeDir}`,
		);
		throw error;
	} finally {
		await lifetime.stop();
	}
}
async function runReplay(
	dependencies: ReplayDependencies,
	request: ReplayRequest,
): Promise<ReplayOutcome> {
	const inputs = await loadReplayInputs(dependencies, request);
	const lifetime = await ReplayLifetime.start(dependencies, request, inputs);
	const outcome = await executeReplay({
		dependencies,
		inputs,
		lifetime,
		request,
	});
	await lifetime.remove();

	return outcome;
}
export { runReplay };
export { default as ReplayError } from "./replay-contract";
export type {
	ReplayPlan,
	ReplayRequest,
	ReplayOutcome,
} from "./replay-contract";
export type { ReplayDependencies } from "./replay-dependencies";
export { loadRunCheckpoints, resolveReplay } from "./replay-lineage";
export { readPriorArtifacts } from "./replay-corpus";
export { detachedStageDependencies } from "./replay-stage-execution";
export { readReplayRecord, replayRecordSchema } from "./replay-record";
export type { ReplayRecord } from "./replay-record";
