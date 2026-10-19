import { resolve, sep } from "node:path";

const MISSING_PATH_SEPARATOR_INDEX = -1;

/** The roots a corpus source permits reads to resolve within. */
interface DirectoryCorpusRoot {
	readonly kind: "directory";
	readonly root: string;
}

interface LiveCorpusRoot {
	readonly kind: "live";
	readonly root: string;
	readonly backingRoot: string;
}

type CorpusRoot = DirectoryCorpusRoot | LiveCorpusRoot;

class CorpusFileError extends Error {
	public override name = "CorpusFileError";
}

/**
 * A declared path is data, and `..` in it would name a file the corpus install
 * does not hold, whose bytes would then be hashed into lineage and whose
 * resolved path would be printed in the attempt record. This reads the path as
 * written and resolves no link in it: where the bytes actually land is
 * `resolvesOutside`, which the reads and hashes consult before opening them.
 */
function withoutTraversal(root: string, layoutPath: string): string {
	const absolute = resolve(root, layoutPath);
	if (!absolute.startsWith(`${root}${sep}`)) {
		throw new CorpusFileError(
			`Corpus file ${layoutPath} names a path outside the corpus install`,
		);
	}

	return absolute;
}

/**
 * The corpus's global instruction file, in corpus layout. A repository's own
 * CLAUDE.md is its project instructions and is not this file.
 */
const CORPUS_INSTRUCTIONS_PATH = "CLAUDE.md";

/**
 * The directories corpus layout holds beside the instruction file. Resolving a
 * declared path, enumerating a source, and deciding whether a directory is a
 * corpus at all are three readings of this one list, so a source cannot hold a
 * kind one of them then fails to see.
 */
const CORPUS_LAYOUT_DIRECTORIES: readonly string[] = [
	"skills",
	"agents",
	"output-styles",
	"rulebook",
];

/**
 * The one predicate that knows what a corpus layout path looks like, so a
 * second reader (observing what a session loaded, rather than resolving it to
 * bytes) answers the same question the same way instead of drifting from it.
 */
function isCorpusLayoutPath(path: string): boolean {
	return (
		path === CORPUS_INSTRUCTIONS_PATH ||
		CORPUS_LAYOUT_DIRECTORIES.some((directory) =>
			path.startsWith(`${directory}/`),
		)
	);
}

/**
 * The layout path a read path carries, or nothing where it carries none. Both
 * roots a corpus can live under, the live install and an attempt's overlay,
 * put the layout path after a `.claude/` segment, so the suffix after the last
 * one is the name a declared entry is already written in.
 *
 * Paired with `isCorpusLayoutPath` above so the two readers that answer "what
 * corpus file is this read?" split the path the same way rather than drifting.
 */
function corpusLayoutSuffix(path: string): string | undefined {
	const marker = "/.claude/";
	const at = path.lastIndexOf(marker);

	return at === MISSING_PATH_SEPARATOR_INDEX
		? undefined
		: path.slice(at + marker.length);
}

/**
 * The corpus root stripped back out of a message built for a caller that
 * throws. `resolveCorpusFile` names the resolved path so an operator reading a
 * refusal on stderr can find the file; the same string on stdout would carry
 * the operator's home directory into a record every reader of `stale` sees.
 */
function withoutAbsolutePaths(message: string, source: CorpusRoot): string {
	return message.replaceAll(`${source.root}/`, "");
}

/**
 * The one place that knows where a corpus layout path lands. A case names a
 * file in corpus layout paths, and this maps that layout onto the root the
 * resolved source carries, so the reader never learns where the bytes came
 * from.
 */
function resolveCorpusFile(source: CorpusRoot, layoutPath: string): string {
	if (isCorpusLayoutPath(layoutPath)) {
		return withoutTraversal(source.root, layoutPath);
	}

	throw new CorpusFileError(
		`Corpus file ${layoutPath} names no corpus layout path: use CLAUDE.md, output-styles/<name>.md, agents/<name>.md, rulebook/<name>.md, or skills/<name>/...`,
	);
}

export {
	CorpusFileError,
	CORPUS_INSTRUCTIONS_PATH,
	CORPUS_LAYOUT_DIRECTORIES,
	isCorpusLayoutPath,
	corpusLayoutSuffix,
	withoutAbsolutePaths,
	resolveCorpusFile,
};
export type { DirectoryCorpusRoot, LiveCorpusRoot, CorpusRoot };
