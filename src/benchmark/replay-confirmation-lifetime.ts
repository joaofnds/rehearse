import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { removeUntilAbsent } from "./file-presence";
import { operatorStopRecord } from "./operator-stop";
import type { ReplayDependencies } from "./replay";
import type {
	ReplayConfirmationOutcome,
	ReplayConfirmationRequest,
} from "./replay-confirmation-contract";
import runReplayConfirmationBody from "./replay-confirmation-execution";
import type { ReplayConfirmationRuntime } from "./replay-confirmation-runtime";
import type { TargetServices } from "./target-services";
import { stopEvery } from "./target-services";

interface ReplayLifetimeInput {
	readonly dependencies: ReplayDependencies;
	readonly request: ReplayConfirmationRequest;
	readonly frozen: ReplayConfirmationRuntime["frozen"];
	readonly paths: ReplayConfirmationRuntime["paths"];
}
class ReplayConfirmationLifetime {
	readonly #input: ReplayLifetimeInput;
	readonly #worktreesDirectory: string;
	readonly #started: TargetServices[] = [];
	readonly #tracked: ReplayDependencies;
	readonly #release: ReturnType<ReplayDependencies["stopOnSignal"]>;
	private constructor(input: ReplayLifetimeInput, worktreesDirectory: string) {
		this.#input = input;
		this.#worktreesDirectory = worktreesDirectory;
		const { dependencies, frozen, paths } = input;
		this.#tracked = {
			...dependencies,
			services: (owner) => {
				const services = dependencies.services(owner);
				this.#started.push(services);

				return services;
			},
		};
		this.#release = dependencies.stopOnSignal(
			async () => {
				try {
					// The killed reps' own removals may still be at work on this tree.
					await removeUntilAbsent(worktreesDirectory);
					await dependencies.pruneWorktrees(frozen.sourceRoot);
				} finally {
					await stopEvery(this.#started);
				}
			},
			async (signal) => {
				await Bun.write(paths.operatorStopFile, operatorStopRecord(signal));
			},
		);
	}
	public static async open(
		input: ReplayLifetimeInput,
	): Promise<ReplayConfirmationLifetime> {
		const { request } = input;
		const worktreesDirectory = await mkdtemp(
			join(tmpdir(), `rehearse-${request.groupId}-`),
		);

		return new ReplayConfirmationLifetime(input, worktreesDirectory);
	}
	public async confirm(
		runtime: Omit<ReplayConfirmationRuntime, "worktreesDirectory">,
	): Promise<ReplayConfirmationOutcome> {
		try {
			return await runReplayConfirmationBody(
				this.#tracked,
				this.#input.request,
				{ ...runtime, worktreesDirectory: this.#worktreesDirectory },
			);
		} catch (error) {
			await rm(this.#worktreesDirectory, { force: true, recursive: true });
			throw error;
		} finally {
			this.#release();
		}
	}
}
export default ReplayConfirmationLifetime;
