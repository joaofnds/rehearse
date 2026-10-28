import { chmod, copyFile, lstat, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

import { lstatIfPresent } from "./file-presence";

type EntryFilter = (source: string) => Promise<boolean>;

/**
 * Copies the regular files and directories under `source` that `keep` accepts,
 * with their modes, and leaves out anything else, a symlink included. An entry
 * whose source is gone by the time it is copied is left out too, since a
 * process still running in the tree can remove a file after its directory was
 * listed. `cp` cannot do that: it stats each entry again after its filter
 * accepts it and throws on the ENOENT. Every other failure throws, and so does
 * a missing `source`.
 */
async function copyPresentTree(
	source: string,
	destination: string,
	keep: EntryFilter,
): Promise<void> {
	await copyEntry(source, destination, keep);
}

async function copyPresentEntry(
	source: string,
	destination: string,
	keep: EntryFilter,
): Promise<void> {
	if (!(await keep(source))) {
		return;
	}

	try {
		await copyEntry(source, destination, keep);
	} catch (error) {
		if ((await lstatIfPresent(source)) === undefined) {
			return;
		}

		throw error;
	}
}

async function copyEntry(
	source: string,
	destination: string,
	keep: EntryFilter,
): Promise<void> {
	const entry = await lstat(source);
	if (entry.isFile()) {
		await copyFile(source, destination);
	} else if (entry.isDirectory()) {
		const names = await readdir(source);
		await mkdir(destination);
		await Array.fromAsync(names, async (name) => {
			await copyPresentEntry(join(source, name), join(destination, name), keep);
		});
		await chmod(destination, entry.mode);
	}
}

export { copyPresentTree as default };
