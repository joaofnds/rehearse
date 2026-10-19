import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";

import { resolveCorpusSource } from "#benchmark/corpus-source";
import { TestResources } from "#benchmark/test-support";

const NO_ACCESS_MODE = 0o000;

const OWNER_DIRECTORY_MODE = 0o700;

const live = await resolveCorpusSource();

const resources = new TestResources();

async function outsideFile(text: string): Promise<string> {
	const outside = await resources.createControlDirectory();
	const path = join(outside, "secret.md");
	await Bun.write(path, text);

	return path;
}

interface ConfiguredBackingCorpus {
	readonly root: string;
	readonly configured: string;
}
async function configuredBackingCorpus(): Promise<ConfiguredBackingCorpus> {
	const root = await resources.createControlDirectory();
	const configured = await resources.createControlDirectory();
	const formerDefault = await resources.createControlDirectory();
	await mkdir(join(root, "output-styles"), { recursive: true });
	await Bun.write(join(configured, "allowed.md"), "allowed\n");
	await Bun.write(join(formerDefault, "refused.md"), "REFUSED BYTES\n");
	await symlink(
		join(configured, "allowed.md"),
		join(root, "output-styles", "allowed.md"),
	);
	await symlink(
		join(formerDefault, "refused.md"),
		join(root, "output-styles", "refused.md"),
	);

	return { configured, root };
}
interface PrivateBackingCorpus {
	readonly root: string;
	readonly backingParent: string;
	readonly backingRoot: string;
}
async function privateBackingCorpus(): Promise<PrivateBackingCorpus> {
	const root = await resources.createControlDirectory();
	const backingParent = await resources.createControlDirectory();
	const backingRoot = join(backingParent, "private", "backing");
	await mkdir(backingRoot, { recursive: true });

	return { backingParent, backingRoot, root };
}

export {
	NO_ACCESS_MODE,
	OWNER_DIRECTORY_MODE,
	live,
	resources,
	outsideFile,
	configuredBackingCorpus,
	privateBackingCorpus,
};
