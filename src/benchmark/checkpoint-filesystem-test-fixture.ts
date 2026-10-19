import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { TestResources } from "./test-support";

async function temporaryDirectory(
	resources: Readonly<TestResources>,
	prefix: string,
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), prefix));

	resources.track(directory);

	return directory;
}

interface FixtureFiles {
	readonly root: string;
	readonly files: readonly (readonly [path: string, contents: string])[];
}

async function writeFixtureFiles({ root, files }: FixtureFiles): Promise<void> {
	await Array.fromAsync(files, async ([path, contents]) => {
		const destination = join(root, path);

		await mkdir(dirname(destination), { recursive: true });

		await Bun.write(destination, contents);
	});
}

export { temporaryDirectory, writeFixtureFiles };
