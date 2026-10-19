import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import seedPipelineCorpus from "./staleness-pipeline-corpus-test-fixtures";

const RESOURCE_DRAIN_START_INDEX = 0;

class StalenessTestFiles {
	private readonly roots: string[] = [];

	public own(roots: readonly string[]): void {
		this.roots.push(...roots);
	}
	public async temporaryDirectory(prefix: string): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), prefix));
		this.roots.push(root);
		return root;
	}
	public async cleanup(): Promise<void> {
		await Promise.all(
			this.roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
				await rm(root, { force: true, recursive: true });
			}),
		);
	}
	public async stageCorpus(prefix = "rehearse-group-corpus-"): Promise<string> {
		const corpus = await this.temporaryDirectory(prefix);
		await seedPipelineCorpus(corpus);

		return corpus;
	}

	public async buildCorpus(prefix: string): Promise<string> {
		const corpus = await this.temporaryDirectory(prefix);
		await mkdir(join(corpus, "skills", "build"), { recursive: true });
		await Bun.write(join(corpus, "CLAUDE.md"), "the instructions\n");
		await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "build\n");
		return corpus;
	}
}
function sha256Of(contents: string): string {
	return new Bun.CryptoHasher("sha256").update(contents).digest("hex");
}

export { StalenessTestFiles, sha256Of };
