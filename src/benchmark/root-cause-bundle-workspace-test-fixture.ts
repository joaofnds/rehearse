import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TestResources } from "./test-support";

class RootCauseBundleWorkspace {
	readonly #resources: Readonly<Pick<TestResources, "track">>;
	public constructor(resources: Readonly<Pick<TestResources, "track">>) {
		this.#resources = resources;
	}
	public async createDirectory(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-root-cause-bundle-"));
		this.#resources.track(root);

		return root;
	}
}
export { RootCauseBundleWorkspace as default };
