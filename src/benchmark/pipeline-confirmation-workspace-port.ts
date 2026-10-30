import type {
	StageCorpusInstaller,
	materializeCheckpoint,
	recordCheckpoint,
} from "./checkpoint";
import type {
	captureBaselineContext,
	captureFileHashes,
	runChecks,
} from "./checks";
import type { TargetCheck } from "./pipeline";
import type {
	addWorktree,
	captureBuildCandidate,
	pruneWorktrees,
	recordRetentionRef,
	removeWorktree,
} from "./target";
import type { ContainerOwner, TargetServices } from "./target-services";

interface PipelineConfirmationWorkspace {
	readonly runChecks: typeof runChecks;
	readonly runSetup: (
		targetDir: string,
		setup: readonly TargetCheck[] | undefined,
		log: (message: string) => void,
	) => Promise<void>;
	readonly captureBaselineContext: typeof captureBaselineContext;
	readonly captureFileHashes: typeof captureFileHashes;
	readonly addWorktree: typeof addWorktree;
	readonly removeWorktree: typeof removeWorktree;
	readonly pruneWorktrees: typeof pruneWorktrees;
	readonly stopOnSignal: (
		cleanUp: () => Promise<void>,
		recordStop: (signal: NodeJS.Signals) => Promise<void>,
	) => () => void;
	readonly materializeCheckpoint: typeof materializeCheckpoint;
	readonly installStageCorpusSnapshot: StageCorpusInstaller;
	readonly recordCheckpoint: typeof recordCheckpoint;
	readonly recordRetentionRef: typeof recordRetentionRef;
	readonly captureBuildCandidate: typeof captureBuildCandidate;
	readonly services: (owner: ContainerOwner) => TargetServices;
	readonly projectsDirectory?: string | undefined;
	readonly log: (message: string) => void;
}
export type { PipelineConfirmationWorkspace };
