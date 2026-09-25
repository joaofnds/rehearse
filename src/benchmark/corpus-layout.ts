import { join } from "node:path";
import type { HashedFile } from "./checkpoint";
import { walkDirectory } from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import {
	CORPUS_INSTRUCTIONS_PATH,
	CORPUS_LAYOUT_DIRECTORIES,
	corpusFileRefusal,
	corpusInstructionsEntry,
	hashCorpusFiles,
} from "./corpus-file";
import {
	classifyEntry,
	refusedEntryReason,
	SymlinkedEntryError,
} from "./file-presence";

export interface HashedLayout {
	readonly files: readonly HashedFile[];
	readonly refusals: readonly string[];
}

/**
 * The corpus is the instruction file and `CORPUS_LAYOUT_DIRECTORIES` beside
 * it. Hashing the root whole instead sweeps in whatever else lives under it,
 * which for a corpus rooted at a real `~/.claude` means caches, logs, and
 * credentials, none of which any stage reads and none of which belong in a
 * digest or on a screen.
 *
 * One unhashable entry refuses its own layout directory and no other, so the
 * caller gets the directories that hashed whole beside a refusal naming each
 * one that did not. The instruction file is inside that tolerance: this report
 * is what the corpus screen renders, and a refusal naming CLAUDE.md tells the
 * operator which file broke the corpus, where a thrown error reaches the
 * screen as "Could not load the corpus." and names nothing. A caller holding
 * a refusal holds no identity for the corpus, so an unidentifiable corpus is
 * never named as an identified one.
 */
export async function hashCorpusLayout(
	source: CorpusRoot,
): Promise<HashedLayout> {
	const { root } = source;
	const files: HashedFile[] = [];
	const refusals: string[] = [];

	const instructions = await corpusInstructionsEntry(source);
	if (instructions.kind === "refused") {
		refusals.push(instructions.refusal);
	} else if (instructions.kind === "present") {
		try {
			const hashed = await hashCorpusFiles(source, [CORPUS_INSTRUCTIONS_PATH]);
			files.push(...hashed.map(({ path, sha256 }) => ({ path, sha256 })));
		} catch (error) {
			/**
			 * The entry classified as a regular file inside the corpus, so what
			 * is left to fail is the open itself, which reports a hostile entry
			 * on filesystems where the `stat` pair did not.
			 */
			const reason =
				error instanceof Error
					? refusedEntryReason(error, instructions.path)
					: undefined;
			if (reason !== undefined) {
				refusals.push(corpusFileRefusal(CORPUS_INSTRUCTIONS_PATH, reason));
			} else if (error instanceof SymlinkedEntryError) {
				refusals.push(error.message);
			} else {
				throw error;
			}
		}
	}

	for (const directory of CORPUS_LAYOUT_DIRECTORIES) {
		const absolute = join(root, directory);
		const entry = await classifyEntry(absolute);
		if (entry.kind === "absent") {
			continue;
		}
		if (entry.kind === "refused") {
			refusals.push(`${directory} ${entry.reason}`);
			continue;
		}
		if (entry.kind !== "directory") {
			refusals.push(
				`${directory} is not a directory, so it cannot contain corpus files to hash`,
			);
			continue;
		}

		try {
			const walked = await walkDirectory(absolute, directory, {
				source,
			});
			if (walked.refusals.length > 0) {
				refusals.push(...walked.refusals.map(({ message }) => message));
				continue;
			}

			files.push(...walked.files);
		} catch (error) {
			const reason =
				error instanceof Error
					? refusedEntryReason(error, absolute)
					: undefined;
			if (reason !== undefined) {
				refusals.push(`${directory} ${reason}`);
			} else if (error instanceof SymlinkedEntryError) {
				refusals.push(error.message);
			} else {
				throw error;
			}
		}
	}

	return { files, refusals };
}
