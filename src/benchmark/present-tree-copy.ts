import { copyFile, lstat, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

type EntryFilter = (source: string) => Promise<boolean>;

async function unlessVanished<T>(
	operation: Promise<T>,
): Promise<T | undefined> {
	try {
		return await operation;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return undefined;
		}

		throw error;
	}
}

/**
 * Copies the regular files and directories under `source` that `keep` accepts,
 * and treats an entry that disappears between being listed and being copied as
 * one the tree no longer holds. A process that outlives the one that wrote the
 * tree can still be changing it: a `git commit` starts `git maintenance run
 * --auto --detach` (git 2.56, GIT_TRACE2), whose `objects/maintenance.lock`
 * came and went inside a copy. `cp` has no option for this and stats
 * each entry again after its filter accepts it, so a filter that skips a
 * vanished entry narrows that window without closing it.
 *
 * Only regular files and directories are copied. A symlink, socket, or FIFO is
 * dropped, which is what `preserveStateEvidence` asks of a symlink and the
 * reason it gives.
 */
async function copyPresentTree(
	source: string,
	destination: string,
	keep: EntryFilter,
): Promise<void> {
	if (!(await keep(source))) {
		return;
	}

	const entry = await unlessVanished(lstat(source));
	if (entry?.isDirectory() === true) {
		const names = await unlessVanished(readdir(source));
		if (names === undefined) {
			return;
		}

		await mkdir(destination);
		await Array.fromAsync(names, async (name) => {
			await copyPresentTree(join(source, name), join(destination, name), keep);
		});
	} else if (entry?.isFile() === true) {
		await unlessVanished(copyFile(source, destination));
	}
}

export { copyPresentTree as default };
