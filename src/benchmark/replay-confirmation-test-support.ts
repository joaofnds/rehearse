import { NOTHING_DELIVERED, materializeCheckpoint } from "./checkpoint";
import { uncitedStageInstall } from "./checkpoint-filesystem-test-fixture";
import type { TargetCheck } from "./pipeline";
import type { ReplayDependencies } from "./replay";
import type { ReplayConfirmationRequest } from "./replay-confirmation";
import ReplayConfirmationRequestBuilder from "./replay-confirmation-request-test-builder";
import type {
	ReplayConfirmationInputs,
	ReplayConfirmationRequestOverride,
} from "./replay-confirmation-request-test-builder";
import ReplayStageSessionHarness, {
	replayScorecard,
} from "./replay-confirmation-stage-test-harness";
import { targetServices } from "./target-services";
import {
	FakeContainerRuntime,
	READY_AT_ONCE,
} from "./target-services-test-support";
import { createProductOwner } from "./workflow";

type ReplayDependencyOverride = (
	defaults: ReplayDependencies,
) => ReplayDependencies;
interface ReplayConfirmationInvocation {
	readonly dependencies: ReplayDependencies;
	readonly request: ReplayConfirmationRequest;
}
class ReplayConfirmationHarness extends ReplayStageSessionHarness {
	public readonly dependencies: ReplayDependencies;
	public readonly worktrees: { root: string; sha: string; path: string }[] = [];
	public readonly removed: string[] = [];
	public readonly stops: (() => Promise<void>)[] = [];
	public readonly releasedStops = new Set<() => Promise<void>>();
	public readonly pruned: string[] = [];
	public readonly setups: {
		readonly targetDir: string;
		readonly setup: readonly TargetCheck[] | undefined;
	}[] = [];
	public readonly containers = new FakeContainerRuntime();
	public readonly integrityFileSets: (readonly string[])[] = [];
	public readonly log: string[] = [];
	public readonly corpusInstalls: {
		readonly snapshotDirectory: string;
		readonly targetDirectory: string;
	}[] = [];
	private readonly runtimeDependencies: Omit<
		ReplayDependencies,
		"stageSession" | "stopOnSignal"
	> = {
		addWorktree: async (root, sha, path) => {
			this.worktrees.push({ path, root, sha });

			await Promise.resolve();
		},
		captureBaselineContext: async (targetDir) => {
			this.stageDirs.push(targetDir);

			return await Promise.resolve([]);
		},
		captureFileHashes: async (targetDir, integrityFiles) => {
			this.stageDirs.push(targetDir);
			this.integrityFileSets.push(integrityFiles);

			return await Promise.resolve(new Map<string, string>());
		},
		createProductOwner,
		currentSha: async (targetDir: string) => {
			this.stageDirs.push(targetDir);

			return await Promise.resolve("base-sha");
		},
		installStageCorpusSnapshot: async (snapshotDirectory, targetDirectory) => {
			this.corpusInstalls.push({ snapshotDirectory, targetDirectory });

			return await Promise.resolve(NOTHING_DELIVERED);
		},
		loadStageRubric: async () =>
			await Promise.resolve({
				content: "{}",
				rubric: {
					dimensions: [
						{
							description: "Clear",
							excellent: "e",
							good: "g",
							id: "clarity",
						},
					],
					hardBlockers: [],
					requirements: [{ description: "Scope is explicit", id: "scope" }],
				},
				rubricPath: "rubrics/stage.json",
			}),
		log: (message) => {
			this.log.push(message);
		},
		materializeCheckpoint,
		pruneWorktrees: async (root) => {
			this.pruned.push(root);

			await Promise.resolve();
		},
		removeWorktree: async (_root, path) => {
			this.removed.push(path);

			await Promise.resolve();
		},
		replaySourceRoot: async ({ checkout }) => await Promise.resolve(checkout),
		runSetup: async (targetDir, setup) => {
			this.setups.push({ setup, targetDir });

			await Promise.resolve();
		},
		runStageJudge: async (_execution, { input }) => {
			this.judged.push(input);

			return await Promise.resolve(replayScorecard(input));
		},
		services: (owner) => targetServices(owner, this.containers, READY_AT_ONCE),
	};
	private readonly stopOnSignal: ReplayDependencies["stopOnSignal"] = (
		cleanUp,
		recordStop,
	) => {
		// A released stop is inert, as the real one is once its signals
		// return to their default.
		let released = false;
		const stop = async (): Promise<void> => {
			if (released) {
				return;
			}

			await recordStop?.("SIGTERM");
			await cleanUp();
		};
		this.stops.push(stop);

		return () => {
			released = true;
			this.releasedStops.add(stop);
		};
	};
	public constructor(...overrides: readonly ReplayDependencyOverride[]) {
		super();
		let dependencies: ReplayDependencies = {
			...this.runtimeDependencies,
			stageSession: this.stageSession,
			stopOnSignal: this.stopOnSignal,
		};
		for (const override of overrides) {
			dependencies = override(dependencies);
		}
		this.dependencies = dependencies;
	}
	public prepareConfirmation(
		inputs: ReplayConfirmationInputs,
		requestOverride: ReplayConfirmationRequestOverride = {},
		...dependencyOverrides: readonly ReplayDependencyOverride[]
	): ReplayConfirmationInvocation {
		let dependencies: ReplayDependencies = {
			...this.dependencies,
			installStageCorpusSnapshot: uncitedStageInstall,
		};
		for (const override of dependencyOverrides) {
			dependencies = override(dependencies);
		}
		const request = new ReplayConfirmationRequestBuilder(requestOverride).build(
			inputs,
		);

		return { dependencies, request };
	}
}
export { ReplayConfirmationHarness as default };
export type { ReplayConfirmationInvocation, ReplayDependencyOverride };
