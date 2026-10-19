import { mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ReplayRequest } from "./replay";
import type { TestResources } from "./test-support";

interface ReplayVariantOptions {
	readonly instructions: string;
	readonly prefix: string;
}
class ReplayCorpusVariantBuilder {
	readonly #options: ReplayVariantOptions;
	public constructor(options: Partial<ReplayVariantOptions> = {}) {
		this.#options = {
			instructions: options.instructions ?? "variant instructions",
			prefix: options.prefix ?? "rehearse-variant-",
		};
	}
	public async build(resources: Pick<TestResources, "track">): Promise<{
		readonly instructions: string;
		readonly source: ReplayRequest["corpusSource"];
	}> {
		const root = await mkdtemp(join(tmpdir(), this.#options.prefix));
		resources.track(root);
		await Bun.write(join(root, "CLAUDE.md"), this.#options.instructions);
		await Array.fromAsync(["discuss", "build"], async (skill) => {
			await Bun.write(join(root, "skills", skill, "SKILL.md"), skill);
		});
		await Bun.write(join(root, "shared", "review.md"), "variant agent");
		await symlink(join(root, "shared"), join(root, "agents"));

		return {
			instructions: this.#options.instructions,
			source: { kind: "directory", root },
		};
	}
}
export default ReplayCorpusVariantBuilder;
