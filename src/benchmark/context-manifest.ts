import { isAbsolute, relative } from "node:path";
import { corpusLayoutSuffix, isCorpusLayoutPath } from "./corpus-file";
import type { Immutable } from "./contracts";
import type { TranscriptLine } from "./transcript";
import {
	filesRead,
	instructionFiles,
	outputStyles,
	skillDirectories,
	toolUsesExceptFailed,
} from "./transcript";

export type ContextHalf = "corpus" | "project";

export interface ManifestEntry {
	readonly path: string;
	readonly half: ContextHalf;
}

/**
 * The observed set is name-only: the transcript never carries the corpus's own
 * bytes (doc-9 gap 2), so a manifest entry is a layout path and nothing a hash
 * could attach to.
 */
export interface ContextManifest {
	readonly paths: readonly ManifestEntry[];
}

export type ManifestDivergence =
	| {
			readonly kind: "undeclared-file";
			readonly path: string;
			readonly half: ContextHalf;
	  }
	| {
			readonly kind: "unloaded-file";
			readonly path: string;
			readonly half: ContextHalf;
	  };

/**
 * A session loads a real file, so a `Read`, an instructions attachment and a
 * skill body name an absolute path, either under the live install
 * (`~/.claude/<layoutPath>`) or under an attempt's corpus overlay
 * (`<attemptDirectory>/.claude/<layoutPath>`, `session-corpus.ts`). Both
 * shapes share the `.claude/` segment immediately before the layout path, so
 * the manifest entry is the suffix after the last one, not the loaded path
 * itself.
 *
 * A caller that knows where its corpus resolved from passes those roots, and
 * then only a load they account for is a corpus file, by its path inside its
 * root. A `.claude/` directory anywhere else holds bytes the corpus version
 * never measured.
 */
function readCorpusLayoutPath(
	path: string,
	corpusRoots?: CorpusReadRoots,
): string | undefined {
	if (corpusRoots === undefined) {
		const inside = isCorpusLayoutPath(path) ? path : corpusLayoutSuffix(path);

		return inside !== undefined && isCorpusLayoutPath(inside)
			? inside
			: undefined;
	}

	const shadowed = pathInsideAny(path, corpusRoots.shadow);
	const inside =
		shadowed === undefined
			? pathInsideAny(path, corpusRoots.sources)
			: corpusRoots.shadowed.find((file) => file === shadowed);

	return inside !== undefined && isCorpusLayoutPath(inside)
		? inside
		: undefined;
}

/**
 * Where a session's corpus resolved from. A source directory holds the whole
 * corpus, so any layout file under it is the corpus's. The `.claude` a
 * session searches first, the target's own or the copy installed into it,
 * holds corpus bytes only for the files the corpus resolved there at the
 * start, so a file beside them came from the repository or was written by
 * the session.
 */
export interface CorpusReadRoots {
	readonly sources: readonly string[];
	readonly shadow: readonly string[];
	readonly shadowed: readonly string[];
}

/** Whether `path` is a load of the corpus under `corpusRoots`. */
export function isCorpusRead(
	path: string,
	corpusRoots: CorpusReadRoots,
): boolean {
	return readCorpusLayoutPath(path, corpusRoots) !== undefined;
}

/** The path relative to the first of `roots` it lies under, if any. */
export function pathInsideAny(
	path: string,
	roots: readonly string[],
): string | undefined {
	for (const root of roots) {
		const inside = relative(root, path);
		if (inside !== "" && !inside.startsWith("..") && !isAbsolute(inside)) {
			return inside;
		}
	}

	return undefined;
}

/**
 * A corpus file always resolves under a `.claude/` segment (the live install or
 * the attempt's corpus overlay, `readCorpusLayoutPath` above); a project file
 * never does, since `seedFixture` copies it onto the attempt directory's own
 * root. Excluding a path the corpus classifier already claims keeps one loaded
 * path from tagging both halves at once, and rules out the one case this suffix
 * match would otherwise get wrong for a single-segment declared name.
 *
 * A multi-segment declared name (`a/NOTES.md`) still suffix-matches a load at
 * an unrelated, deeper path ending in the same segments (`other/a/NOTES.md`):
 * nothing here knows the attempt directory's own boundary to rule that out,
 * short of threading it through from `session-attempt.ts`, which the fixture-
 * replay test (a committed transcript, no live attempt directory) cannot
 * supply either. Accepted for now on the same trust basis the corpus half
 * already carries: `projectFiles` is case-author data, not session input.
 */
function readProjectLayoutPath(
	path: string,
	declaredProjectFiles: readonly string[],
): string | undefined {
	if (readCorpusLayoutPath(path) !== undefined) {
		return undefined;
	}

	return declaredProjectFiles.find(
		(declared) => path === declared || path.endsWith(`/${declared}`),
	);
}

/**
 * `output_style` last-wins: a transcript naming two different styles across its
 * attachments is a case this card leaves for a follow-up to define further
 * (doc-9 gap 1, AC#4).
 */
function outputStyleLayoutPath(styles: readonly string[]): string | undefined {
	const last = styles.at(-1);

	return last === undefined ? undefined : `output-styles/${last}.md`;
}

function entryKey(entry: ManifestEntry): string {
	return `${entry.half}:${entry.path}`;
}

export function corpusEntries(paths: readonly string[]): ManifestEntry[] {
	return paths.map((path) => ({ path, half: "corpus" as const }));
}

export function projectEntries(paths: readonly string[]): ManifestEntry[] {
	return paths.map((path) => ({ path, half: "project" as const }));
}

function dedupeEntries(
	entries: readonly ManifestEntry[],
): readonly ManifestEntry[] {
	const seen = new Map<string, ManifestEntry>();
	for (const entry of entries) {
		seen.set(entryKey(entry), entry);
	}

	return [...seen.values()];
}

/** Every file path a transcript shows the session loading, as it was loaded. */
export function loadedFiles(
	lines: Immutable<readonly TranscriptLine[]>,
): readonly string[] {
	return [
		...filesRead(toolUsesExceptFailed(lines)),
		...instructionFiles(lines),
		...skillDirectories(lines).map((directory) => `${directory}/SKILL.md`),
	];
}

export function isCorpusLoad(path: string): boolean {
	return readCorpusLayoutPath(path) !== undefined;
}

export function observedManifest(
	lines: Immutable<readonly TranscriptLine[]>,
	declaredProjectFiles: readonly string[] = [],
	corpusRoots?: CorpusReadRoots,
): ContextManifest {
	const loaded = loadedFiles(lines);
	const corpusPaths = loaded
		.map((path) => readCorpusLayoutPath(path, corpusRoots))
		.filter((path) => path !== undefined);
	const projectPaths = loaded
		.map((path) => readProjectLayoutPath(path, declaredProjectFiles))
		.filter((path) => path !== undefined);
	const stylePath = outputStyleLayoutPath(outputStyles(lines));

	const entries: ManifestEntry[] = [
		...corpusEntries(corpusPaths),
		...projectEntries(projectPaths),
		...(stylePath === undefined ? [] : corpusEntries([stylePath])),
	];

	return { paths: dedupeEntries(entries) };
}

export function reconcileManifest(
	manifest: Readonly<ContextManifest>,
	declared: readonly ManifestEntry[],
): readonly ManifestDivergence[] {
	const declaredSet = new Set(declared.map((entry) => entryKey(entry)));
	const observedSet = new Set(manifest.paths.map((entry) => entryKey(entry)));

	const undeclared: ManifestDivergence[] = manifest.paths
		.filter((entry) => !declaredSet.has(entryKey(entry)))
		.map((entry) => ({
			kind: "undeclared-file",
			path: entry.path,
			half: entry.half,
		}));

	const unloaded: ManifestDivergence[] = declared
		.filter((entry) => !observedSet.has(entryKey(entry)))
		.map((entry) => ({
			kind: "unloaded-file",
			path: entry.path,
			half: entry.half,
		}));

	return [...undeclared, ...unloaded];
}
