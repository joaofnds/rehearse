import type { HashedFile } from "./checkpoint-lineage";
import type { CorpusRoot } from "./corpus-file";
import {
	CorpusFileError,
	hashCorpusFiles,
	resolveCorpusFile,
	withoutAbsolutePaths,
} from "./corpus-file";
import type { StageCorpus } from "./corpus-file-changes";
import { hashedCorpus, refusedCorpus } from "./corpus-file-changes";
import { SymlinkedEntryError, classifyEntry } from "./file-presence";
import type { ReadManifestEntry } from "./read-manifest";

interface RecordedReads {
	readonly corpusFiles: readonly HashedFile[];
	readonly readManifest?: readonly ReadManifestEntry[] | undefined;
}

/**
 * The corpus files a record's manifest hashed beyond the ones it captured,
 * which a stage loads when it reads another skill it was never given.
 */
function loadedBeyondCaptured(record: RecordedReads): HashedFile[] {
	const captured = new Set(record.corpusFiles.map(({ path }) => path));

	return (record.readManifest ?? []).flatMap((entry) =>
		entry.half === "corpus" &&
		entry.sha256 !== undefined &&
		!captured.has(entry.path)
			? [{ path: entry.path, sha256: entry.sha256 }]
			: [],
	);
}

/** Every corpus file a record read, captured or loaded beyond that. */
function readCorpusFiles(record: RecordedReads): HashedFile[] {
	return [...record.corpusFiles, ...loadedBeyondCaptured(record)];
}

/**
 * A stage's corpus now, with each file its record loaded beyond the captured
 * ones as `source` holds it, so every caller comparing against
 * `readCorpusFiles` holds the same files on both sides. A file the source no
 * longer holds is left out, so the comparison names it removed; one it
 * refuses to read refuses the whole corpus, as a refused captured file does.
 * A file the stage captures now is already on the current side.
 */
async function withLoadedFilesNow(
	now: StageCorpus,
	record: RecordedReads,
	source: CorpusRoot,
): Promise<StageCorpus> {
	if ("refused" in now) {
		return now;
	}

	const hashed: HashedFile[] = [...now.hashed];
	const capturedNow = new Set(now.hashed.map(({ path }) => path));
	try {
		await Array.fromAsync(loadedBeyondCaptured(record), async ({ path }) => {
			if (capturedNow.has(path)) {
				return;
			}

			const entry = await classifyEntry(resolveCorpusFile(source, path));
			if (entry.kind === "absent") {
				return;
			}

			for (const file of await hashCorpusFiles(source, [path])) {
				hashed.push({ path: file.path, sha256: file.sha256 });
			}
		});
	} catch (error) {
		if (
			error instanceof CorpusFileError ||
			error instanceof SymlinkedEntryError
		) {
			return refusedCorpus(withoutAbsolutePaths(error.message, source));
		}

		throw error;
	}

	return hashedCorpus(hashed);
}
export { loadedBeyondCaptured, readCorpusFiles, withLoadedFilesNow };
export type { RecordedReads };
