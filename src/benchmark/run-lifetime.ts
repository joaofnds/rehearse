import { killActiveCommands } from "./command";
import processSignals from "./process-signals";
import { createRunAbort, fileRunArtifactPersistence } from "./run-abort";
import type { RunAbort } from "./run-abort";
import type { RunSource } from "./run-artifact";
import { openRunEventStore, runEventRecorderFor } from "./run-events";
import type { RunEventRecorder, RunEventStore } from "./run-events";
import type { RunIdentity } from "./run-identity";
import { runEventsDatabaseFile } from "./run-layout";
import type RunOutput from "./run-output";
import {
	RunWorkspace,
	allocateProductOwnerDirectory,
	removeProductOwnerDirectory,
} from "./run-workspace";
import type { SpendCeiling } from "./spend-ceiling";

interface RunLifetimeRequest {
	readonly identity: RunIdentity;
	readonly output: RunOutput;
	readonly spendCeiling: SpendCeiling;
}
interface RunLifetimeResources {
	readonly workspace: Readonly<RunWorkspace>;
	readonly eventStore: RunEventStore;
	readonly productOwnerDirectory: string;
}
class RunLifetime {
	private readonly startedAtMs = Date.now();
	public readonly elapsedMs = (): number => Date.now() - this.startedAtMs;
	public readonly events: RunEventRecorder;
	public readonly abort: RunAbort;
	public constructor(
		request: RunLifetimeRequest,
		public readonly resources: RunLifetimeResources,
	) {
		this.events = runEventRecorderFor(
			resources.eventStore,
			request.identity.files.name,
			request.spendCeiling,
		);
		this.abort = createRunAbort(
			{
				elapsedMs: this.elapsedMs,
				killActiveCommands,
				...processSignals(request.output.flush),
				persistence: fileRunArtifactPersistence,
				reportError: request.output.diagnostics.reportError,
				runEvents: this.events,
			},
			{
				artifactFile: request.identity.files.artifactFile,
				operatorStopFile: request.identity.files.operatorStopFile,
				teardown: async () => {
					await resources.workspace.release(request.output.log);
				},
			},
		);
	}
	public async clone(): Promise<RunSource> {
		try {
			return await this.resources.workspace.clone();
		} catch (error) {
			this.resources.eventStore.close();
			this.abort.release();
			await removeProductOwnerDirectory(this.resources.productOwnerDirectory);
			throw error;
		}
	}
	public async close(): Promise<void> {
		try {
			await this.abort.teardown();
		} finally {
			this.abort.release();
			this.resources.eventStore.close();
			await removeProductOwnerDirectory(this.resources.productOwnerDirectory);
		}
	}
}
async function openRunLifetime(
	request: RunLifetimeRequest,
): Promise<RunLifetime> {
	const workspace = new RunWorkspace(request.identity);
	const eventStore = await openRunEventStore(
		runEventsDatabaseFile(request.identity.files.runsDirectory),
	);
	const productOwnerDirectory = await allocateProductOwnerDirectory();
	return new RunLifetime(request, {
		eventStore,
		productOwnerDirectory,
		workspace,
	});
}
export { RunLifetime, openRunLifetime };
