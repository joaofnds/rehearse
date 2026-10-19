import { hashWorkflowState, initialCheckpointInputs } from "./checkpoint";
import type {
	FrozenPipelineInputs,
	PipelineInputExecution,
} from "./pipeline-frozen-inputs";

interface PipelineInitialCheckpoint extends PipelineInputExecution {
	readonly setupWorktree: string;
	readonly checkpointDirectory: string;
}
async function recordPipelineInitialCheckpoint({
	dependencies,
	request,
	setupWorktree,
	checkpointDirectory,
}: PipelineInitialCheckpoint): Promise<
	Pick<FrozenPipelineInputs, "taskId" | "taskSha" | "initialCheckpoint">
> {
	const { taskId, taskSha } = await dependencies.seedTaskBoard(
		setupWorktree,
		request.task,
		request.pipeline.statuses,
	);

	const initialCheckpoint = await dependencies.recordCheckpoint(
		setupWorktree,
		checkpointDirectory,
		initialCheckpointInputs(
			{
				productBrief: request.productBrief,
				task: request.task,
				taskSha,
				workflowFiles: await hashWorkflowState(setupWorktree),
			},
			{
				effort: request.effort,
				model: request.model,
				settingsFile: request.loadedSettings?.hashed,
			},
		),
	);

	await dependencies.recordRetentionRef(
		request.source.root,
		`${request.groupId}/setup`,
		taskSha,
	);

	return { initialCheckpoint, taskId, taskSha };
}
export { recordPipelineInitialCheckpoint as default };
