import { mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TestResources } from "./test-support";

interface ReplayCorpusFile {
	readonly path: string;
	readonly content: string;
}
interface ReplayCorpusOptions {
	readonly files: readonly ReplayCorpusFile[];
	readonly prefix: string;
}
const DEFAULT_FILES = [
	{ content: "discuss\n", path: "skills/discuss/SKILL.md" },
	{ content: "build\n", path: "skills/build/SKILL.md" },
	{ content: "doctrine\n", path: "skills/doctrine/SKILL.md" },
];
class ReplayCorpusBuilder {
	readonly #options: ReplayCorpusOptions;
	public constructor(overrides: Partial<ReplayCorpusOptions> = {}) {
		this.#options = {
			files: overrides.files ?? DEFAULT_FILES,
			prefix: overrides.prefix ?? "rehearse-corpus-",
		};
	}
	public async build(resources: Pick<TestResources, "track">): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), this.#options.prefix));
		resources.track(root);
		await this.writeTo(root);

		return root;
	}
	public async writeForeignTo(root: string, outside: string): Promise<void> {
		await this.writeTo(root);
		await Bun.write(join(outside, "private.md"), "foreign bytes\n");
		await symlink(outside, join(root, "agents"));
	}
	public async writeTo(root: string): Promise<void> {
		await Array.fromAsync(this.#options.files, async ({ path, content }) => {
			await Bun.write(join(root, path), content);
		});
	}
}
export default ReplayCorpusBuilder;
