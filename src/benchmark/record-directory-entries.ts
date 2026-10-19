import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";

import { scopedRecordReader } from "./record-read-scope";

const LEXICAL_BEFORE = -1;
const LEXICAL_AFTER = 1;

/**
 * Enumeration lives beside the path builders because this module is the only
 * one that knows a run's checkpoints directory carries a suffix, a group is a
 * directory under `confirmations`, and a replay record is a timestamp file
 * under its lineage. A directory that was never written is nothing recorded,
 * not a failure: `list` over a fresh checkout prints no line and exits 0.
 */
const entries = scopedRecordReader(
	async (directory): Promise<readonly Dirent[]> => {
		const found: Dirent[] = await readdir(directory, {
			withFileTypes: true,
		}).catch(() => []);

		return found.toSorted((left, right) =>
			left.name < right.name ? LEXICAL_BEFORE : LEXICAL_AFTER,
		);
	},
);

async function directoryNames(directory: string): Promise<readonly string[]> {
	const found = await entries(directory);

	return found.filter((entry) => entry.isDirectory()).map(({ name }) => name);
}

export { directoryNames, entries };
