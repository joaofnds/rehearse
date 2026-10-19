import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TestResources } from "./test-support";

class RecordReadWorkspace {
	readonly #resources: Readonly<Pick<TestResources, "track">>;
	public constructor(resources: Readonly<Pick<TestResources, "track">>) {
		this.#resources = resources;
	}
	public async file(prefix: string, content: string): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), prefix));
		this.#resources.track(root);
		const file = join(root, "record.json");
		await Bun.write(file, content);

		return file;
	}
}
export { RecordReadWorkspace as default };
