import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { removeUntilAbsent } from "./file-presence";
import { openGroupDirectory } from "./in-flight-claim";
import { operatorStopRecord } from "./operator-stop";
import type { PipelineConfirmationDependencies } from "./pipeline-confirmation-dependencies";
import type { PipelineConfirmationRequest } from "./pipeline-confirmation-request";
import { confirmationGroupPaths } from "./run-layout";
import type { TargetServices } from "./target-services";
import { stopEvery } from "./target-services";

interface PipelineConfirmationResources {
	readonly paths: ReturnType<typeof confirmationGroupPaths>;
	readonly worktreesDirectory: string;
}
class PipelineConfirmationLifetime {
	private readonly started: TargetServices[] = [];
	private readonly release: () => void;
	public readonly dependencies: PipelineConfirmationDependencies;
	public constructor(
		dependencies: PipelineConfirmationDependencies,
		request: PipelineConfirmationRequest,
		public readonly resources: PipelineConfirmationResources,
	) {
		this.dependencies = {
			...dependencies,
			services: (owner) => {
				const services = dependencies.services(owner);

				this.started.push(services);

				return services;
			},
		};
		this.release = dependencies.stopOnSignal(
			async () => {
				try {
					// The killed reps' own removals may still be at work on this tree.
					await removeUntilAbsent(resources.worktreesDirectory);
					await dependencies.pruneWorktrees(request.source.root);
				} finally {
					await stopEvery(this.started);
				}
			},
			async (signal) => {
				await Bun.write(
					resources.paths.operatorStopFile,
					operatorStopRecord(signal),
				);
			},
		);
	}
	public async discard(): Promise<void> {
		await rm(this.resources.worktreesDirectory, {
			force: true,
			recursive: true,
		});
	}
	public close(): void {
		const { release } = this;
		release();
	}
}
async function openPipelineConfirmationLifetime(
	dependencies: PipelineConfirmationDependencies,
	request: PipelineConfirmationRequest,
): Promise<PipelineConfirmationLifetime> {
	const paths = confirmationGroupPaths(request.runsDirectory, request.groupId);

	await openGroupDirectory(paths);

	// The provider names a session's transcript after its real working path.
	const temporaryDirectory = await mkdtemp(
		join(tmpdir(), `rehearse-${request.groupId}-`),
	);
	const worktreesDirectory = await realpath(temporaryDirectory);

	return new PipelineConfirmationLifetime(dependencies, request, {
		paths,
		worktreesDirectory,
	});
}
export { openPipelineConfirmationLifetime as default };
export type { PipelineConfirmationLifetime, PipelineConfirmationResources };
