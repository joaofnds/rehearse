import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { corpusVersionLog } from "#benchmark/corpus-version";
import { directorySource } from "#benchmark/run-records-test-support";
import type { Paths } from "#server/corpus-edit-workspace-test-fixture";

/** Every file under a directory and its text, so a test sees any write. */
async function treeOf(directory: string): Promise<ReadonlyMap<string, string>> {
	const tree = new Map<string, string>();
	await Array.fromAsync(
		await readdir(directory, { recursive: true }),
		async (path) => {
			const entry = await stat(join(directory, path));
			if (entry.isFile()) {
				tree.set(path, await Bun.file(join(directory, path)).text());
			}
		},
	);

	return tree;
}

interface Untouched {
	readonly tree: ReadonlyMap<string, string>;
	readonly log: readonly string[];
}

async function untouched(served: Paths): Promise<Untouched> {
	return {
		log: await corpusVersionLog(
			served.runsDirectory,
			directorySource(served.corpus),
		),
		tree: await treeOf(served.corpus),
	};
}

export { treeOf, untouched };
