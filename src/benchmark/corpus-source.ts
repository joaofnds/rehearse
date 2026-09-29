import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
	CORPUS_INSTRUCTIONS_PATH,
	CORPUS_LAYOUT_DIRECTORIES,
	liveCorpusSource,
} from "./corpus-file";
import type { DirectoryCorpusRoot, LiveCorpusRoot } from "./corpus-file";
import { recordsDirectory } from "./config";
import { pathExists } from "./file-presence";
import { readSettings, storeLinkedCorpusDirectory } from "./settings";

export class CorpusSourceError extends Error {
	public override name = "CorpusSourceError";
}

/**
 * Where an attempt's corpus bytes come from, parsed once so nothing downstream
 * learns how the directory came to exist. Live sources also carry the backing
 * tree they permit, so later reads do not consult mutable process configuration.
 */
export type ResolvedCorpusSource = LiveCorpusRoot | DirectoryCorpusRoot;

export type CorpusSourceResolver = (
	source: string | undefined,
) => Promise<ResolvedCorpusSource>;

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
	for (const entry of CORPUS_LAYOUT_ENTRIES) {
		if (await pathExists(join(root, entry))) {
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
export interface CorpusLayoutEntry {
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
export async function corpusLayoutEntries(
	source: ResolvedCorpusSource,
): Promise<readonly CorpusLayoutEntry[]> {
	const entries: CorpusLayoutEntry[] = [];

	for (const layoutPrefix of CORPUS_LAYOUT_DIRECTORIES) {
		entries.push(
			...(await entriesUnder(join(source.root, layoutPrefix), layoutPrefix)),
		);
	}

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
export function resolveCorpusSource(
	source: string | undefined,
): Promise<ResolvedCorpusSource> {
	if (source === undefined) {
		return linkedCorpusSource(recordsDirectory());
	}

	return directorySource(source);
}

/**
 * The corpus every command measures unless one is named: the linked
 * directory, or the live install when none is linked.
 */
export async function linkedCorpusSource(
	records: string,
): Promise<ResolvedCorpusSource> {
	const { linkedCorpusDirectory } = await readSettings(records);

	return linkedCorpusDirectory === undefined
		? liveCorpusSource()
		: directorySource(linkedCorpusDirectory);
}

export async function linkCorpus(
	records: string,
	directory: string,
): Promise<DirectoryCorpusRoot> {
	const source = await directorySource(directory);
	await storeLinkedCorpusDirectory(records, source.root);

	return source;
}

export function unlinkCorpus(records: string): Promise<void> {
	return storeLinkedCorpusDirectory(records, undefined);
}
