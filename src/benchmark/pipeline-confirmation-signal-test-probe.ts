import { realpath } from "node:fs/promises";
import { basename } from "node:path";

import { pathExists } from "./file-presence";
import type { PipelineConfirmationDependencies } from "./pipeline-confirmation";
import { git, pruneWorktrees } from "./target";

interface PipelineSignalContext {
	readonly sourceRoot: string;
	readonly expectedReps: number;
}

class PipelineSignalProbe {
	private readonly allCreated = Promise.withResolvers<undefined>();
	private readonly signal = Promise.withResolvers<() => Promise<void>>();
	private stopping: Promise<void> | undefined;
	public readonly createdWorktrees: string[] = [];
	public readonly sourceRoot: Promise<string>;
	public presenceBeforeStop: readonly boolean[] = [];
	public presenceAfterStop: readonly boolean[] = [];
	public registrationsBeforeStop: readonly string[] = [];
	public registrationsAfterStop: readonly string[] = [];

	public constructor(private readonly context: PipelineSignalContext) {
		this.sourceRoot = realpath(context.sourceRoot);
	}

	public readonly override = (
		dependencies: PipelineConfirmationDependencies,
	): PipelineConfirmationDependencies => ({
		...dependencies,
		addWorktree: async (root, sha, path) => {
			await dependencies.addWorktree(root, sha, path);

			if (basename(path).includes("-rep-")) {
				this.createdWorktrees.push(path);
				if (this.createdWorktrees.length === this.context.expectedReps) {
					this.allCreated.resolve();
				}
			}
		},
		pruneWorktrees: async (root) => {
			await pruneWorktrees(root);

			await dependencies.pruneWorktrees(root);
		},
		runSetup: async (path, setup, log) => {
			if (!basename(path).includes("-rep-")) {
				await dependencies.runSetup(path, setup, log);

				return;
			}

			await this.allCreated.promise;
			this.stopping ??= this.stopAndObserve();
			await this.stopping;

			throw new Error("the stop killed this rep's command");
		},
		stopOnSignal: (cleanUp, recordStop) => {
			this.signal.resolve(async () => {
				await recordStop("SIGTERM");

				await cleanUp();
			});

			return dependencies.stopOnSignal(cleanUp, recordStop);
		},
	});

	private async stopAndObserve(): Promise<void> {
		const stop = await this.signal.promise;

		this.presenceBeforeStop = await Promise.all(
			this.createdWorktrees.map(async (path) => await pathExists(path)),
		);

		this.registrationsBeforeStop = await this.registeredWorktrees();

		await stop();

		this.presenceAfterStop = await Promise.all(
			this.createdWorktrees.map(async (path) => await pathExists(path)),
		);

		this.registrationsAfterStop = await this.registeredWorktrees();
	}

	private async registeredWorktrees(): Promise<readonly string[]> {
		const listing = await git(
			this.context.sourceRoot,
			"worktree",
			"list",
			"--porcelain",
		);

		return listing
			.split("\n")
			.filter((line) => line.startsWith("worktree "))
			.map((line) => line.slice("worktree ".length));
	}
}

export { PipelineSignalProbe as default };
