import { writeRunManifest } from "./manifest";
import type { BenchmarkRunExecution } from "./run-execution-context";
import type { InitialRunCorpus } from "./run-initial-corpus";
import buildRunManifest from "./run-manifest";
import type { PreparedRunTarget } from "./run-target-preparation";
import type { PreparedRunTask } from "./run-task";

interface InitialRunManifestRequest {
	readonly execution: BenchmarkRunExecution;
	readonly target: PreparedRunTarget;
	readonly corpus: InitialRunCorpus;
	readonly task: PreparedRunTask;
}
async function recordInitialRunManifest({
	execution,
	target,
	corpus,
	task,
}: InitialRunManifestRequest): Promise<void> {
	const { inputs, identity, source, pipeline, interaction } = execution;
	await writeRunManifest(
		identity.files.manifestFile,
		buildRunManifest({
			baselineChecks: target.baseline.baselineChecks,
			config: inputs.config,
			controlSha: identity.controlSha,
			corpusVersion: corpus.version,
			pipeline,
			productBrief: task.productBrief,
			source,
			spendCeilingUsd: interaction.spendCeilingUsd,
			task: task.task,
			taskId: task.taskId,
			taskSha: task.taskSha,
			timestamp: identity.timestamp,
		}),
	);
}
export { recordInitialRunManifest as default };
