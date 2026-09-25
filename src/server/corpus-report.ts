import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { CorpusRoot } from "#benchmark/corpus-file";
import type { LastEdit } from "#benchmark/corpus-invalidation";
import { corpusInvalidation } from "#benchmark/corpus-invalidation";
import { hashCorpusLayout } from "#benchmark/corpus-layout";
import { corpusVersionDigest } from "#benchmark/corpus-version";
import { redactAbsolutePaths } from "./redact-path";

export interface CorpusFileReport {
	readonly path: string;
	readonly sha256: string;
	readonly lastEditedAt: string;
	/** Distinct run-history rows that read the file. */
	readonly readBy: number;
	/**
	 * Rows that read the file's hash in the previous version, which the
	 * corpus under test no longer holds.
	 */
	readonly invalidated: number;
}

export interface CorpusReport {
	readonly root: string;
	readonly digest: string | undefined;
	readonly files: readonly CorpusFileReport[];
	readonly refusals: readonly string[];
	readonly lastEdit: LastEdit;
}

export async function corpusReport(
	source: CorpusRoot,
	runsDirectory: string,
): Promise<CorpusReport> {
	const layout = await hashCorpusLayout(source);
	const invalidation = await corpusInvalidation(runsDirectory, source);

	const files: CorpusFileReport[] = [];
	for (const file of layout.files) {
		const fileStats = await stat(join(source.root, file.path));
		files.push({
			path: file.path,
			sha256: file.sha256,
			lastEditedAt: fileStats.mtime.toISOString(),
			readBy: invalidation.readBy.get(file.path) ?? 0,
			invalidated: invalidation.invalidated.get(file.path) ?? 0,
		});
	}

	return {
		root: source.root,
		digest:
			layout.refusals.length > 0
				? undefined
				: corpusVersionDigest(layout.files),
		files,
		refusals: layout.refusals.map((refusal) => redactAbsolutePaths(refusal)),
		lastEdit: invalidation.lastEdit,
	};
}
