import { INITIAL_CHECKPOINT_STAGE, hashWorkflowState } from "./checkpoint";
import type { CheckpointRecord, recordCheckpoint } from "./checkpoint";
import { ordinaryInitialCheckpointInputs } from "./run-baseline";
import type { BenchmarkRunExecution } from "./run-execution-context";
import type { PreparedRunTask } from "./run-task";

interface InitialRunCheckpointRequest {
	readonly execution: BenchmarkRunExecution;
	readonly task: PreparedRunTask;
	readonly record: typeof recordCheckpoint;
}
async function recordInitialRunCheckpoint({
	execution,
	task,
	record,
}: InitialRunCheckpointRequest): Promise<CheckpointRecord> {
	const { source, identity, inputs } = execution;
	return await record(
		source.root,
		identity.files.checkpointDirectory(INITIAL_CHECKPOINT_STAGE),
		ordinaryInitialCheckpointInputs(
			{
				productBrief: task.productBrief,
				task: task.task,
				taskSha: task.taskSha,
				workflowFiles: await hashWorkflowState(source.root),
			},
			{
				effort: inputs.config.effort,
				loadedSettings: inputs.loadedSettings,
				model: inputs.config.model,
			},
		),
	);
}
export { recordInitialRunCheckpoint as default };
