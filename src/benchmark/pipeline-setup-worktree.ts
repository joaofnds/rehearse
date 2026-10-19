import { join } from "node:path";

import type {
	FrozenPipelineInputs,
	PipelineInputExecution,
} from "./pipeline-frozen-inputs";
import recordPipelineInitialCheckpoint from "./pipeline-initial-checkpoint";
import preparePipelineBaseline from "./pipeline-setup-baseline";
import type { TargetServices } from "./target-services";

type PreparedPipelineSetup = Pick<
	FrozenPipelineInputs,
	| "taskId"
	| "taskSha"
	| "initialCheckpoint"
	| "baselineContext"
	| "baselineHashes"
	| "checkpointDirectory"
>;
class PipelineSetupWorktree {
	private readonly path: string;
	private readonly services: TargetServices;
	private constructor(private readonly execution: PipelineInputExecution) {
		this.path = join(execution.directories.worktreesDirectory, "setup");
		this.services = execution.dependencies.services({
			attempt: `${execution.request.groupId}-setup`,
			run: execution.request.groupId,
		});
	}
	public static async open(
		execution: PipelineInputExecution,
	): Promise<PipelineSetupWorktree> {
		const setup = new PipelineSetupWorktree(execution);

		await execution.dependencies.addWorktree(
			execution.request.source.root,
			execution.request.source.sha,
			setup.path,
		);

		return setup;
	}
	public async freeze(): Promise<PreparedPipelineSetup> {
		const checkpointDirectory = join(
			this.execution.directories.inputsDirectory,
			"checkpoint",
		);
		try {
			const baseline = await preparePipelineBaseline({
				...this.execution,
				services: this.services,
				setupWorktree: this.path,
			});

			const checkpoint = await recordPipelineInitialCheckpoint({
				...this.execution,
				checkpointDirectory,
				setupWorktree: this.path,
			});

			return { ...baseline, ...checkpoint, checkpointDirectory };
		} finally {
			await this.close();
		}
	}
	private async close(): Promise<void> {
		try {
			await this.execution.dependencies.removeWorktree(
				this.execution.request.source.root,
				this.path,
			);
		} finally {
			await this.services.stop();
		}
	}
}
export { PipelineSetupWorktree as default };
