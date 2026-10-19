import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { recordsDirectory } from "./config";
import {
	CORPUS_INSTRUCTIONS_PATH,
	CORPUS_LAYOUT_DIRECTORIES,
	liveCorpusSource,
} from "./corpus-file";
import type { DirectoryCorpusRoot, LiveCorpusRoot } from "./corpus-file";
import hashCorpusLayout from "./corpus-layout";
import { RefusedPreconditionError } from "./exit-codes";
import { pathExists } from "./file-presence";
import serialMap from "./serial-map";
import {
	LINK_CORPUS_COMMAND,
	UNLINK_CORPUS_COMMAND,
	readSettings,
	storeLinkedCorpusDirectory,
} from "./settings";

const EMPTY_COLLECTION_LENGTH = 0;

class CorpusSourceError extends Error {
	public override name = "CorpusSourceError";
}

/**
 * Where an attempt's corpus bytes come from, parsed once so nothing downstream
 * learns how the directory came to exist. Live sources also carry the backing
 * tree they permit, so later reads do not consult mutable process configuration.
 */
type ResolvedCorpusSource = LiveCorpusRoot | DirectoryCorpusRoot;

type CorpusSourceResolver = (source?: string) => Promise<ResolvedCorpusSource>;

/**
 * The entries a directory must hold at least one of to be a corpus. Without
 * this a mistyped path resolves to an empty corpus, and every declared file
 * then fails one at a time instead of the source failing once.
 */
const CORPUS_LAYOUT_ENTRIES: readonly string[] = [
	CORPUS_INSTRUCTIONS_PATH,
	...CORPUS_LAYOUT_DIRECTORIES,
];

async function holdsCorpusLayout(root: string): Promise<boolean> {
	for await (const exists of serialMap(
		CORPUS_LAYOUT_ENTRIES.values(),
		async (entry) => await pathExists(join(root, entry)),
	)) {
		if (exists) {
			return true;
		}
	}

	return false;
}

async function directorySource(source: string): Promise<DirectoryCorpusRoot> {
	const root = resolve(source);
	if (!(await pathExists(root))) {
		throw new CorpusSourceError(
			`Corpus source ${source} is not an existing directory: a corpus source is a directory in corpus layout`,
		);
	}
	if (!(await holdsCorpusLayout(root))) {
		throw new CorpusSourceError(
			`Corpus source ${root} holds no corpus layout entry: expected one of ${CORPUS_LAYOUT_ENTRIES.join(", ")}`,
		);
	}

	return { kind: "directory", root };
}

/**
 * One corpus file or skill directory a source holds, named by where it lands in
 * corpus layout and where its bytes are read from. The snapshot copies these,
 * so nothing after it reads the source tree again.
 */
interface CorpusLayoutEntry {
	readonly layoutPath: string;
	readonly sourcePath: string;
}

async function entriesUnder(
	directory: string,
	layoutPrefix: string,
): Promise<CorpusLayoutEntry[]> {
	const names = await readdir(directory).catch(() => []);

	return names
		.toSorted((left, right) => left.localeCompare(right))
		.map((name) => ({
			layoutPath: `${layoutPrefix}/${name}`,
			sourcePath: join(directory, name),
		}));
}

/**
 * Every corpus file a source holds, in corpus layout. A source is already in
 * corpus layout, so this reads its entries where they are and never learns what
 * produced the directory.
 */
async function corpusLayoutEntries(
	source: ResolvedCorpusSource,
): Promise<readonly CorpusLayoutEntry[]> {
	const entries: CorpusLayoutEntry[] = [];

	await Array.fromAsync(CORPUS_LAYOUT_DIRECTORIES, async (layoutPrefix) => {
		entries.push(
			...(await entriesUnder(join(source.root, layoutPrefix), layoutPrefix)),
		);
	});

	const instructions = join(source.root, CORPUS_INSTRUCTIONS_PATH);
	if (await pathExists(instructions)) {
		entries.unshift({
			layoutPath: CORPUS_INSTRUCTIONS_PATH,
			sourcePath: instructions,
		});
	}

	return entries;
}

/**
 * The source string is parsed once here, at the boundary, so a caller that
 * holds a resolved source cannot be holding a directory that does not exist or
 * one that holds no corpus.
 */
async function resolveCorpusSource(
	source?: string,
): Promise<ResolvedCorpusSource> {
	if (source === undefined) {
		return await linkedCorpusSource(recordsDirectory());
	}

	return await directorySource(source);
}

/**
 * The corpus every command measures unless one is named: the linked
 * directory, or the live install when none is linked.
 */
async function linkedCorpusSource(
	records: string,
	live: () => LiveCorpusRoot = liveCorpusSource,
): Promise<ResolvedCorpusSource> {
	const { linkedCorpusDirectory } = await readSettings(records);

	return linkedCorpusDirectory === undefined
		? live()
		: await linkedDirectorySource(linkedCorpusDirectory);
}

/**
 * The link was a corpus when it was stored, so one that no longer is has been
 * moved or emptied since, and the refusal names how to get out of it.
 */
async function linkedDirectorySource(
	directory: string,
): Promise<DirectoryCorpusRoot> {
	try {
		return await directorySource(directory);
	} catch (error) {
		if (!(error instanceof CorpusSourceError)) {
			throw error;
		}
		throw new RefusedPreconditionError(
			`The linked corpus directory ${directory} is no longer a corpus. ${error.message}. Link another with ${LINK_CORPUS_COMMAND}, or unlink it with: ${UNLINK_CORPUS_COMMAND}`,
		);
	}
}

/**
 * A corpus whose layout cannot be hashed has no version, so every replay and
 * rehash against it would refuse. Linking refuses it first, with the same
 * reasons, and keeps the link it had.
 */
async function linkCorpus(
	records: string,
	directory: string,
): Promise<DirectoryCorpusRoot> {
	const source = await directorySource(directory);
	const { refusals } = await hashCorpusLayout(source);
	if (refusals.length > EMPTY_COLLECTION_LENGTH) {
		throw new CorpusSourceError(
			`Corpus source ${source.root} cannot be measured: ${refusals.join("; ")}`,
		);
	}

	await storeLinkedCorpusDirectory(records, source.root);

	return source;
}

async function unlinkCorpus(records: string): Promise<void> {
	await storeLinkedCorpusDirectory(records);
}

/**
 * A pipeline run measures only the live install, so a linked directory would
 * be silently ignored if the run went ahead.
 */
async function refusePipelineUnderLinkedDirectory(
	records: string,
): Promise<void> {
	const linked = await linkedCorpusSource(records);
	if (linked.kind === "directory") {
		throw new RefusedPreconditionError(
			`The linked corpus is the directory ${linked.root}, and a pipeline run measures only the live install. Replay a stage to measure the linked corpus, or unlink it with: ${UNLINK_CORPUS_COMMAND}`,
		);
	}
}

export {
	CorpusSourceError,
	corpusLayoutEntries,
	resolveCorpusSource,
	linkedCorpusSource,
	linkCorpus,
	unlinkCorpus,
	refusePipelineUnderLinkedDirectory,
};
export type { ResolvedCorpusSource, CorpusSourceResolver, CorpusLayoutEntry };
