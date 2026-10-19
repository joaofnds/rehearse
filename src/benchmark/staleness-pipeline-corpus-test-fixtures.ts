import { mkdir } from "node:fs/promises";
import { join } from "node:path";

async function seedPipelineCorpus(corpus: string): Promise<void> {
	await mkdir(join(corpus, "skills", "build"), { recursive: true });
	await mkdir(join(corpus, "skills", "discuss"), { recursive: true });
	await Bun.write(join(corpus, "CLAUDE.md"), "the instructions\n");
	await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "build\n");
	await Bun.write(join(corpus, "skills", "discuss", "SKILL.md"), "discuss\n");
}
export { seedPipelineCorpus as default };
