import type { BenchmarkRunExecution } from "./run-execution-context";
import recordInitialRunCheckpoint from "./run-initial-checkpoint";
import measureInitialRunCorpus from "./run-initial-corpus";
import type { InitialRunEvidence } from "./run-initial-evidence-contract";
import recordInitialRunManifest from "./run-manifest-persistence";
import createRunProductOwner from "./run-product-owner";
import { retainedCheckpointRecorder, retentionInTarget } from "./run-retention";
import type { PreparedRunTarget } from "./run-target-preparation";
import prepareRunTask from "./run-task";

async function prepareInitialRunEvidence(
	execution: BenchmarkRunExecution,
	target: PreparedRunTarget,
): Promise<InitialRunEvidence> {
	const {
		task,
		productBrief,
		finalRubric: rubric,
	} = execution.inputs.benchmarkCase;
	const corpus = await measureInitialRunCorpus(
		execution.identity.files.runsDirectory,
	);
	const preparedTask = await prepareRunTask(execution, {
		productBrief,
		rubric,
		task,
	});
	const retainCommit = retentionInTarget(execution.identity.target.root);
	const recordCheckpoint = retainedCheckpointRecorder(
		execution.identity.files.name,
		retainCommit,
	);
	await recordInitialRunManifest({
		corpus,
		execution,
		target,
		task: preparedTask,
	});
	const initialCheckpoint = await recordInitialRunCheckpoint({
		execution,
		record: recordCheckpoint,
		task: preparedTask,
	});
	const productOwner = createRunProductOwner(execution, preparedTask);
	return {
		corpus,
		initialCheckpoint,
		productOwner,
		recordCheckpoint,
		retainCommit,
		task: preparedTask,
	};
}
export { prepareInitialRunEvidence as default };
