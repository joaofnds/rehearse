import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	temporaryDirectory,
	writeFixtureFiles,
} from "./checkpoint-filesystem-test-fixture";
import type { LiveCorpusRoot } from "./corpus-file";
import type { TestResources } from "./test-support";

async function installedCorpus(
	resources: Readonly<TestResources>,
): Promise<LiveCorpusRoot> {
	const parent = await temporaryDirectory(resources, "rehearse-layout-");
	const root = join(parent, "install");
	const backingRoot = join(parent, "backing");

	await mkdir(join(root, "skills", "build"), { recursive: true });
	await mkdir(backingRoot);
	await writeFile(join(root, "skills", "build", "SKILL.md"), "build skill");

	return { backingRoot, kind: "live", root };
}

interface LayoutLink {
	readonly source: LiveCorpusRoot;
	readonly layoutPath: string;
	readonly outside: string;
	readonly files: readonly (readonly [string, string])[];
}

async function replaceLayoutWithLink({
	source,
	layoutPath,
	outside,
	files,
}: LayoutLink): Promise<void> {
	await writeFixtureFiles({ files, root: outside });
	await rm(join(source.root, layoutPath), { force: true, recursive: true });

	await symlink(outside, join(source.root, layoutPath));
}

async function linkedAgentCorpus(
	resources: Readonly<TestResources>,
): Promise<LiveCorpusRoot> {
	const source = await installedCorpus(resources);

	await writeFile(join(source.backingRoot, "review.md"), "captured agent");
	await symlink(source.backingRoot, join(source.root, "agents"));
	await symlink(
		join(source.backingRoot, "review.md"),
		join(source.root, "skills", "build", "alias.md"),
	);

	return source;
}

export { installedCorpus, linkedAgentCorpus, replaceLayoutWithLink };
