import { afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RunEventStore } from "./run-events";

class RunEventResources {
	private readonly stores = new Set<RunEventStore>();
	private readonly directories = new Set<string>();

	public static forEachTest(): RunEventResources {
		const resources = new RunEventResources();
		afterEach(async () => {
			await resources.dispose();
		});

		return resources;
	}

	public own(store: RunEventStore): RunEventStore {
		this.stores.add(store);
		return store;
	}

	public async directory(): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-run-events-"));
		this.directories.add(directory);

		return directory;
	}

	private async dispose(): Promise<void> {
		for (const store of this.stores) {
			store.close();
		}
		this.stores.clear();

		await Promise.all(
			[...this.directories].map(async (directory) => {
				await rm(directory, { force: true, recursive: true });
			}),
		);
		this.directories.clear();
	}
}

export { RunEventResources as default };
