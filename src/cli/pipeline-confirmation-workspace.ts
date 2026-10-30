import {
	installStageCorpusSnapshot,
	materializeCheckpoint,
	recordCheckpoint,
} from "#benchmark/checkpoint";
import {
	captureBaselineContext,
	captureFileHashes,
	runChecks,
	runSetup,
} from "#benchmark/checks";
import { dockerContainerRuntime } from "#benchmark/docker-container-runtime";
import { userCitationMap } from "#benchmark/live-citation-map";
import type { PipelineConfirmationWorkspace } from "#benchmark/pipeline-confirmation-workspace-port";
import { claudeProjectsDirectory } from "#benchmark/session-capture";
import { processSignalStop, stopOnSignal } from "#benchmark/stop-on-signal";
import {
	addWorktree,
	captureBuildCandidate,
	pruneWorktrees,
	recordRetentionRef,
	removeWorktree,
} from "#benchmark/target";
import type { ContainerRuntime } from "#benchmark/target-services";
import { SERVICE_READINESS, targetServices } from "#benchmark/target-services";
import type { CommandOutput } from "#cli/output";
import { diagnosticWriter, signalDiagnostics } from "#cli/output";

interface PipelineConfirmationWorkspaceContext {
	readonly output: CommandOutput;
	readonly containers?: ContainerRuntime | undefined;
}

class PipelineConfirmationWorkspaceRuntime implements PipelineConfirmationWorkspace {
	readonly #output: CommandOutput;
	readonly #containers: ContainerRuntime;
	public readonly addWorktree = addWorktree;
	public readonly captureBaselineContext = captureBaselineContext;
	public readonly captureBuildCandidate = captureBuildCandidate;
	public readonly captureFileHashes = captureFileHashes;
	public readonly installStageCorpusSnapshot = installStageCorpusSnapshot;
	public readonly liveCitations = userCitationMap;
	public readonly log: PipelineConfirmationWorkspace["log"];
	public readonly materializeCheckpoint = materializeCheckpoint;
	public readonly projectsDirectory: string;
	public readonly pruneWorktrees = pruneWorktrees;
	public readonly recordCheckpoint = recordCheckpoint;
	public readonly recordRetentionRef = recordRetentionRef;
	public readonly removeWorktree = removeWorktree;
	public readonly runChecks = runChecks;
	public readonly runSetup = runSetup;
	public readonly services: PipelineConfirmationWorkspace["services"] = (
		owner,
	) => targetServices(owner, this.#containers, SERVICE_READINESS);
	public readonly stopOnSignal = (
		cleanUp: () => Promise<void>,
		recordStop?: (signal: NodeJS.Signals) => Promise<void>,
	): (() => void) =>
		stopOnSignal(
			processSignalStop(signalDiagnostics(this.#output)),
			cleanUp,
			recordStop,
		);
	public constructor({
		output,
		containers = dockerContainerRuntime,
	}: PipelineConfirmationWorkspaceContext) {
		this.#containers = containers;
		this.#output = output;
		this.log = diagnosticWriter(output);
		this.projectsDirectory = claudeProjectsDirectory();
	}
}
export { PipelineConfirmationWorkspaceRuntime as default };
