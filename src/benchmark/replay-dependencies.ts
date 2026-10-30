import type {
	HomePathCitationMap,
	installStageCorpusSnapshot,
	materializeCheckpoint,
} from "./checkpoint";
import type { captureBaselineContext, captureFileHashes } from "./checks";
import type { TargetCheck } from "./pipeline";
import type { repositoryHolding } from "./run-repositories";
import type { runStageJudge } from "./stage-grading";
import type { loadStageRubric } from "./stage-rubric";
import type { StageSessionDependencies } from "./stage-session-dependencies";
import type {
	addWorktree,
	currentSha,
	pruneWorktrees,
	removeWorktree,
} from "./target";
import type { ContainerOwner, TargetServices } from "./target-services";
import type { createProductOwner } from "./workflow";

interface ReplayDependencies {
	readonly stageSession: StageSessionDependencies;
	readonly createProductOwner: typeof createProductOwner;
	readonly runStageJudge: typeof runStageJudge;
	readonly loadStageRubric: typeof loadStageRubric;
	readonly addWorktree: typeof addWorktree;
	readonly removeWorktree: typeof removeWorktree;
	readonly pruneWorktrees: typeof pruneWorktrees;
	readonly replaySourceRoot: typeof repositoryHolding;
	/**
	 * Removes the worktree on a stop signal, once every command is killed,
	 * until the release it answers is called.
	 */
	readonly stopOnSignal: (
		cleanUp: () => Promise<void>,
		recordStop?: (signal: NodeJS.Signals) => Promise<void>,
	) => () => void;
	readonly materializeCheckpoint: typeof materializeCheckpoint;
	readonly captureBaselineContext: typeof captureBaselineContext;
	readonly captureFileHashes: typeof captureFileHashes;
	readonly currentSha: typeof currentSha;
	readonly runSetup: (
		targetDir: string,
		setup: readonly TargetCheck[] | undefined,
		log: (message: string) => void,
	) => Promise<void>;
	/** The services one replay, or one attempt of a replay confirmation, starts and stops. */
	readonly services: (owner: ContainerOwner) => TargetServices;
	readonly installStageCorpusSnapshot: typeof installStageCorpusSnapshot;
	/** The live install's citation map, read once when a run freezes its inputs. */
	readonly liveCitations: () => Promise<HomePathCitationMap>;
	/**
	 * Where the provider writes session transcripts, read for what the stage
	 * loaded. Without it the read manifest holds only what the stage declared.
	 */
	readonly projectsDirectory?: string | undefined;
	readonly log: (message: string) => void;
	/**
	 * The clock the replay's elapsed time is read from; a monotonic one by
	 * default, so a system clock step cannot make it negative.
	 */
	readonly now?: (() => number) | undefined;
}
export type { ReplayDependencies };
