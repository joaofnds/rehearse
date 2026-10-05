import { lstat, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

export class RecordsSizeError extends Error {
	public override name = "RecordsSizeError";
}

/** A run writing beside the walk can remove a file the walk listed. */
async function fileSize(path: string): Promise<number> {
	try {
		const stats = await lstat(path);

		return stats.size;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return 0;
		}
		throw error;
	}
}

/**
 * The bytes the records directory holds, counted over its regular files. A
 * symlink is not followed, because what it points at is not stored there.
 * A directory not created yet holds nothing.
 */
export async function recordsSize(directory: string): Promise<number> {
	try {
		const entries = await readdir(directory, {
			withFileTypes: true,
			recursive: true,
		});
		const sizes = await Promise.all(
			entries
				.filter((entry) => entry.isFile())
				.map((entry) => fileSize(join(entry.parentPath, entry.name))),
		);

		return sizes.reduce((total, size) => total + size, 0);
	} catch (error) {
		if (!(error instanceof Error && "code" in error && "path" in error)) {
			throw error;
		}
		const path = String(error.path);
		const code = String(error.code);
		if (code === "ENOENT" && path === directory) {
			return 0;
		}

		throw new RecordsSizeError(
			`Could not measure the records directory, because ${relative(directory, path) || "the directory itself"} could not be read (${code})`,
		);
	}
}
