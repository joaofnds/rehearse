import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { CorpusRoot } from "#benchmark/corpus-file";
import type { LastEdit } from "#benchmark/corpus-invalidation";
import { corpusInvalidation } from "#benchmark/corpus-invalidation";
import hashCorpusLayout from "#benchmark/corpus-layout";
import { withCorpusReadScope } from "#benchmark/corpus-read-scope";
import { corpusVersionDigest } from "#benchmark/corpus-version";
import lineCount from "#benchmark/line-count";

import { redactAbsolutePaths } from "./redact-path";

const NO_RECORDED_READERS = 0;
const NO_INVALIDATED_RESULTS = 0;

const EMPTY_COLLECTION_LENGTH = 0;

interface CorpusFileReport {
	readonly path: string;
	readonly sha256: string;
	readonly lastEditedAt: string;
	readonly lines: number;
	/** Distinct run-history rows that read the file. */
	readonly readBy: number;
	/**
	 * Rows that read the file's hash in the previous version, which the
	 * corpus under test no longer holds.
	 */
	readonly invalidated: number;
}

interface CorpusReport {
	readonly root: string;
	readonly digest: string | undefined;
	readonly files: readonly CorpusFileReport[];
	readonly refusals: readonly string[];
	readonly lastEdit: LastEdit;
}

type CorpusSummary = Omit<CorpusReport, "files" | "lastEdit"> & {
	readonly files: readonly Pick<
		CorpusFileReport,
		"path" | "sha256" | "lastEditedAt"
	>[];
};

/** The sidebar's corpus identity and file count need no saved-record judgments. */
async function corpusSummary(source: CorpusRoot): Promise<CorpusSummary> {
	return await withCorpusReadScope(async () => {
		const layout = await hashCorpusLayout(source);
		const files = await Promise.all(
			layout.files.map(async (file) => {
				const stats = await stat(join(source.root, file.path));
				return { ...file, lastEditedAt: stats.mtime.toISOString() };
			}),
		);

		return {
			digest:
				layout.refusals.length > EMPTY_COLLECTION_LENGTH
					? undefined
					: corpusVersionDigest(layout.files),
			files,
			refusals: layout.refusals.map((refusal) => redactAbsolutePaths(refusal)),
			root: source.root,
		};
	});
}

async function corpusReport(
	source: CorpusRoot,
	runsDirectory: string,
): Promise<CorpusReport> {
	return await withCorpusReadScope(async () => {
		const layout = await hashCorpusLayout(source);
		const invalidation = await corpusInvalidation(runsDirectory, source);

		const files: CorpusFileReport[] = [];
		await Array.fromAsync(layout.files, async (file) => {
			const filePath = join(source.root, file.path);
			const fileStats = await stat(filePath);
			files.push({
				invalidated:
					invalidation.invalidated.get(file.path) ?? NO_INVALIDATED_RESULTS,
				lastEditedAt: fileStats.mtime.toISOString(),
				lines: lineCount(await readFile(filePath, "utf8")),
				path: file.path,
				readBy: invalidation.readBy.get(file.path) ?? NO_RECORDED_READERS,
				sha256: file.sha256,
			});
		});

		return {
			digest:
				layout.refusals.length > EMPTY_COLLECTION_LENGTH
					? undefined
					: corpusVersionDigest(layout.files),
			files,
			lastEdit: invalidation.lastEdit,
			refusals: layout.refusals.map((refusal) => redactAbsolutePaths(refusal)),
			root: source.root,
		};
	});
}

export { corpusSummary, corpusReport };
export type { CorpusFileReport, CorpusReport, CorpusSummary };
