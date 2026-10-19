import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import type { ReplayRequest } from "./replay-contract";
import type { ReplayDependencies } from "./replay-dependencies";
import type { ReplayInputs } from "./replay-lineage";
import type { TargetServices } from "./target-services";

interface ReplayLifetimeState {
	readonly dependencies: ReplayDependencies;
	readonly sourceRoot: string;
	readonly parent: string;
	readonly worktreeDir: string;
	readonly productOwnerDirectory: string;
	readonly services: TargetServices;
	readonly release: () => void;
}
class ReplayLifetime {
	readonly #state: ReplayLifetimeState;
	public constructor(state: ReplayLifetimeState) {
		this.#state = state;
	}
	public get worktreeDir(): string {
		return this.#state.worktreeDir;
	}
	public get productOwnerDirectory(): string {
		return this.#state.productOwnerDirectory;
	}
	public get services(): TargetServices {
		return this.#state.services;
	}
	public static async start(
		dependencies: ReplayDependencies,
		request: ReplayRequest,
		inputs: ReplayInputs,
	): Promise<ReplayLifetime> {
		// The provider names a session's transcript after its real working path.
		const temporaryDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-replay-"),
		);
		const parent = await realpath(temporaryDirectory);
		const worktreeDir = join(parent, "worktree");
		const productOwnerDirectory = join(parent, "product-owner");
		const services = dependencies.services({
			attempt: basename(parent),
			run: request.paths.name,
		});
		await dependencies.addWorktree(
			inputs.sourceRoot,
			inputs.plan.consumed.targetSha,
			worktreeDir,
		);
		const release = dependencies.stopOnSignal(async () => {
			try {
				await dependencies.removeWorktree(inputs.sourceRoot, worktreeDir);
				await rm(parent, { force: true, recursive: true });
			} finally {
				await services.stop();
			}
		});

		return new ReplayLifetime({
			dependencies,
			parent,
			productOwnerDirectory,
			release,
			services,
			sourceRoot: inputs.sourceRoot,
			worktreeDir,
		});
	}
	public async stop(): Promise<void> {
		const { release, services } = this.#state;
		release();
		await services.stop();
	}
	public async remove(): Promise<void> {
		const { dependencies, sourceRoot, worktreeDir, parent } = this.#state;
		await dependencies.removeWorktree(sourceRoot, worktreeDir);
		await rm(parent, { force: true, recursive: true });
	}
}
export default ReplayLifetime;
