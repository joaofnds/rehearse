import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { dockerContainerRuntime } from "./docker-container-runtime";
import type { RunSource } from "./run-artifact";
import { cloneSource, releaseRun } from "./run-checkout";
import type { RunIdentity } from "./run-identity";
import { SERVICE_READINESS, targetServices } from "./target-services";

class RunWorkspace {
	public readonly services;
	private source: RunSource | undefined = undefined;
	public constructor(private readonly identity: RunIdentity) {
		this.services = targetServices(
			{ attempt: identity.files.name, run: identity.files.name },
			dockerContainerRuntime,
			SERVICE_READINESS,
		);
	}
	public async clone(): Promise<RunSource> {
		this.source = await cloneSource(
			this.identity.target,
			this.identity.files.name,
		);
		return this.source;
	}
	public async release(log: (message: string) => void): Promise<void> {
		await (this.source === undefined
			? this.services.stop()
			: releaseRun(
					{
						checkout: this.source.root,
						runName: this.identity.files.name,
						targetRoot: this.identity.target.root,
					},
					this.services,
					log,
				));
	}
}
async function allocateProductOwnerDirectory(): Promise<string> {
	return await mkdtemp(join(tmpdir(), "rehearse-po-"));
}
async function removeProductOwnerDirectory(directory: string): Promise<void> {
	await rm(directory, { force: true, recursive: true });
}
export {
	RunWorkspace,
	allocateProductOwnerDirectory,
	removeProductOwnerDirectory,
};
