import { lstat, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const NO_STORED_BYTES = 0;

class RecordsSizeError extends Error {
	public override name = "RecordsSizeError";
}

/** A run writing beside the walk can remove an entry the walk listed. */
async function unlessRemoved(size: Promise<number>): Promise<number> {
	try {
		return await size;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return NO_STORED_BYTES;
		}

		throw error;
	}
}

async function fileSize(path: string): Promise<number> {
	const stats = await lstat(path);

	return stats.size;
}

/**
 * The regular files' bytes under a directory, descending only into real
 * directories, since a recursive readdir follows a symlinked one.
 */
async function treeSize(directory: string): Promise<number> {
	const entries = await readdir(directory, { withFileTypes: true });
	const sizes = await Promise.all(
		entries.map(async (entry) => {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				return await unlessRemoved(treeSize(path));
			}

			return await (entry.isFile()
				? unlessRemoved(fileSize(path))
				: Promise.resolve(NO_STORED_BYTES));
		}),
	);

	return sizes.reduce((total, size) => total + size, NO_STORED_BYTES);
}

/**
 * The bytes the records directory holds, counted over its regular files. A
 * symlink is not followed, because what it points at is not stored there.
 * A directory not created yet holds nothing.
 */
async function recordsSize(directory: string): Promise<number> {
	try {
		return await treeSize(directory);
	} catch (error) {
		if (!(error instanceof Error && "code" in error && "path" in error)) {
			throw error;
		}

		const path = String(error.path);
		const code = String(error.code);
		if (code === "ENOENT" && path === directory) {
			return NO_STORED_BYTES;
		}

		throw new RecordsSizeError(
			`Could not measure the records directory, because ${relative(directory, path) || "the directory itself"} could not be read (${code})`,
		);
	}
}

export { RecordsSizeError, recordsSize };
