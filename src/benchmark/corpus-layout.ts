import { join } from "node:path";

import type { HashedFile } from "./checkpoint";
import { walkDirectory } from "./checkpoint";
import type { Immutable } from "./contracts";
import type { CorpusRoot } from "./corpus-file";
import {
	CORPUS_INSTRUCTIONS_PATH,
	CORPUS_LAYOUT_DIRECTORIES,
	corpusInstructionsEntry,
	hashCorpusFiles,
} from "./corpus-file";
import { currentCorpusReadScope } from "./corpus-read-scope";
import {
	SymlinkedEntryError,
	classifyEntry,
	refusedEntryReason,
} from "./file-presence";

const EMPTY_COLLECTION_LENGTH = 0;

interface HashedLayout {
	readonly files: readonly HashedFile[];
	readonly refusals: readonly string[];
}

class CorpusLayoutReader {
	private readonly files: HashedFile[] = [];
	private readonly refusals: string[] = [];
	public constructor(private readonly source: CorpusRoot) {}
	public async read(): Promise<HashedLayout> {
		await this.readInstructions();
		await Array.fromAsync(CORPUS_LAYOUT_DIRECTORIES, async (directory) => {
			await this.readDirectory(directory);
		});

		return { files: this.files, refusals: this.refusals };
	}
	private async readInstructions(): Promise<void> {
		const instructions = await corpusInstructionsEntry(this.source);
		if (instructions.kind === "refused") {
			this.refusals.push(instructions.refusal);
		} else if (instructions.kind === "present") {
			try {
				const hashed = await hashCorpusFiles(this.source, [
					CORPUS_INSTRUCTIONS_PATH,
				]);
				this.files.push(
					...hashed.map(({ path, sha256 }) => ({ path, sha256 })),
				);
			} catch (error) {
				if (
					!(error instanceof Error) ||
					!this.recordFailure(
						error,
						instructions.path,
						`Corpus file ${CORPUS_INSTRUCTIONS_PATH}`,
					)
				) {
					throw error;
				}
			}
		}
	}
	private async readDirectory(directory: string): Promise<void> {
		const absolute = join(this.source.root, directory);
		if (!(await this.directoryReady(directory, absolute))) {
			return;
		}

		try {
			const walked = await walkDirectory(absolute, directory, {
				source: this.source,
			});
			this.includeDirectory(walked);
		} catch (error) {
			if (
				!(error instanceof Error) ||
				!this.recordFailure(error, absolute, directory)
			) {
				throw error;
			}
		}
	}
	private includeDirectory(
		walked: Immutable<Awaited<ReturnType<typeof walkDirectory>>>,
	): void {
		if (walked.refusals.length > EMPTY_COLLECTION_LENGTH) {
			this.refusals.push(...walked.refusals.map(({ message }) => message));
			return;
		}

		this.files.push(...walked.files);
	}

	private async directoryReady(
		directory: string,
		absolute: string,
	): Promise<boolean> {
		const entry = await classifyEntry(absolute);
		if (entry.kind === "absent") {
			return false;
		}

		if (entry.kind === "refused") {
			this.refusals.push(`${directory} ${entry.reason}`);
			return false;
		}

		if (entry.kind !== "directory") {
			this.refusals.push(
				`${directory} is not a directory, so it cannot contain corpus files to hash`,
			);
			return false;
		}

		return true;
	}
	private recordFailure(
		error: Readonly<Error>,
		absolute: string,
		description: string,
	): boolean {
		const reason = refusedEntryReason(error, absolute);
		if (reason !== undefined) {
			this.refusals.push(`${description} ${reason}`);
			return true;
		} else if (error instanceof SymlinkedEntryError) {
			this.refusals.push(error.message);
			return true;
		}

		return false;
	}
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
async function hashCorpusLayout(source: CorpusRoot): Promise<HashedLayout> {
	const cache = currentCorpusReadScope()?.layouts;
	const key = JSON.stringify(source);
	let pending = cache?.get(key);
	if (pending === undefined) {
		pending = new CorpusLayoutReader(source).read();
		cache?.set(key, pending);
	}

	return await pending;
}

export { hashCorpusLayout as default };
export type { HashedLayout };
