import { homedir, tmpdir } from "node:os";

const FINAL_PATH_SEGMENT_OFFSET = -1;

const SINGLE_ITEM_COUNT = 1;

function escapeRegExp(literal: string): string {
	return literal.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

/**
 * A root shorter than a directory under the filesystem root is dropped rather
 * than anchored on. `homedir()` is `/` for root in many container images and
 * `tmpdir()` follows `TMPDIR`, and either as `/` or as the empty string turns
 * the unanchored alternative below into a match on every slash, which would
 * replace the relative record ids and corpus paths the general alternatives
 * exist to preserve.
 */
function usableRoots(roots: readonly string[]): readonly string[] {
	return roots.filter(
		(root) => root.startsWith("/") && root.length > SINGLE_ITEM_COUNT,
	);
}

/**
 * Four rules in priority order. A known root is tried first, and when quoted
 * it runs to the closing quote so a directory name containing a space cannot
 * end the match early; an apostrophe inside the name still does, which is the
 * limit `redactAbsolutePaths` documents. The two unknown-root rules are the
 * net for a root this process cannot read, and they stay anchored to a word
 * boundary (start of string, whitespace, an opening paren, or a quote) so a
 * relative record id or corpus path that merely contains a slash survives,
 * e.g. `checkpoint:.../shape` or `skills/build/SKILL.md`.
 *
 * The two known-root rules cannot be collapsed into one running to the closing
 * quote: an unquoted list of paths would then match as a single run, from the
 * first root to the end of the line.
 */
function absolutePathPattern(roots: readonly string[]): RegExp {
	const known = usableRoots(roots)
		.map((root) => escapeRegExp(root))
		.join("|");

	const quotedUnknownRoot = `(?<=['"\`])\\/[^'"\`\\n]*`;
	const bareUnknownRoot = `(?<=^|[\\s(])\\/[^\\s,)]*`;
	if (known === "") {
		return new RegExp([quotedUnknownRoot, bareUnknownRoot].join("|"), "gu");
	}

	const quotedKnownRoot = `(?<=['"\`])(?:${known})[^'"\`\\n]*`;
	const bareKnownRoot = `(?:${known})[^\\s,)'"\`]*`;

	return new RegExp(
		[quotedKnownRoot, bareKnownRoot, quotedUnknownRoot, bareUnknownRoot].join(
			"|",
		),
		"gu",
	);
}

/**
 * `redactAbsolutePaths` against roots the caller names, for a test that cannot
 * change what the process reports as its home or temp directory.
 */
function redactorFor(roots: readonly string[]): (message: string) => string {
	const pattern = absolutePathPattern(roots);

	return (message) => message.replaceAll(pattern, "<path>");
}

const redact = redactorFor([homedir(), tmpdir()]);

/**
 * The general form of `controlRelative`, for a message a route cannot know
 * the origin of: a checkpoint's corpus root or the target repository it ran
 * against, neither of which lives under `CONTROL_DIR`, so stripping only that
 * one prefix leaves the operator's home directory or the target's path intact
 * in an error a browser reads. Every absolute-path-shaped run is replaced
 * outright rather than made relative to anything, since nothing this module
 * reads names a root safe to keep.
 *
 * A path containing a quote character leaves the fragment after that quote
 * behind, under a known root and an unknown one alike: the root is gone, and
 * what survives is a directory and file name with no location. Closing that
 * would need the message's producer to mark its paths rather than the redactor
 * to find them.
 */
function redactAbsolutePaths(message: string): string {
	return redact(message);
}

/**
 * For a field whose whole value is one path, not a message that might contain
 * one. `redactAbsolutePaths` has to guess where a path ends inside prose, so it
 * stops at the first space, comma, paren or quote and leaves the tail of
 * `~/Library/Application Support/Claude/CLAUDE.md` behind. Here the producer
 * knows the value is a path, so no guessing is needed: everything above the
 * file keeps no name, and the file's own name survives.
 *
 * The name has to survive. A load is named by its path and its memory type
 * (GLOSSARY.md, Instruction load), and replacing the whole path leaves every
 * load in a list reading alike, which is no evidence about which file loaded.
 */
function redactedFilePath(path: string): string {
	const separator = /[/\\]/u;
	if (!/^(?:\/|\\\\|[A-Za-z]:[/\\])/u.test(path)) {
		return path;
	}
	const segments = path.split(separator).filter((segment) => segment !== "");
	const name = segments.at(FINAL_PATH_SEGMENT_OFFSET);

	return name === undefined ? "<path>" : `<path>/${name}`;
}

export { redactorFor, redactAbsolutePaths, redactedFilePath };
