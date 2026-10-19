import { symlink } from "node:fs/promises";
import { join } from "node:path";

import { TestResources } from "./test-support";

class CorpusSourceWorkspace {
	readonly #resources: Readonly<
		Pick<TestResources, "createControlDirectory" | "createTemporaryDirectory">
	>;
	private constructor(
		resources: Readonly<
			Pick<TestResources, "createControlDirectory" | "createTemporaryDirectory">
		>,
	) {
		this.#resources = resources;
	}
	public static forEachTest(): CorpusSourceWorkspace {
		return new CorpusSourceWorkspace(TestResources.forEachTest());
	}
	public async directoryCorpus(): Promise<string> {
		const root = await this.#resources.createControlDirectory();
		await Bun.write(join(root, "output-styles/brief.md"), "variant\n");

		return root;
	}
	public async emptyDirectory(): Promise<string> {
		return await this.#resources.createControlDirectory();
	}
	public async records(): Promise<string> {
		return await this.#resources.createTemporaryDirectory("rehearse-link-");
	}
	public async escapingCorpus(): Promise<string> {
		const elsewhere = await this.#resources.createControlDirectory();
		await Bun.write(join(elsewhere, "AGENTS.md"), "instructions\n");
		const unmeasurable = await this.#resources.createControlDirectory();
		await symlink(
			join(elsewhere, "AGENTS.md"),
			join(unmeasurable, "CLAUDE.md"),
		);

		return unmeasurable;
	}
}
export { CorpusSourceWorkspace as default };
