import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TestResources } from "./test-support";

interface TemporaryWorktreeOptions {
	readonly prefix: string;
	readonly leaf: string;
}
interface TemporaryWorktreePaths {
	readonly parent: string;
	readonly worktree: string;
}
class TemporaryWorktreeBuilder {
	readonly #options: TemporaryWorktreeOptions;
	public constructor(options: Partial<TemporaryWorktreeOptions> = {}) {
		this.#options = {
			leaf: options.leaf ?? "worktree",
			prefix: options.prefix ?? "rehearse-worktree-",
		};
	}
	public async build(
		resources: Pick<TestResources, "track">,
	): Promise<TemporaryWorktreePaths> {
		const parent = await mkdtemp(join(tmpdir(), this.#options.prefix));
		resources.track(parent);

		return { parent, worktree: join(parent, this.#options.leaf) };
	}
}
export default TemporaryWorktreeBuilder;
