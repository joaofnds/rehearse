import { corpusLayoutSuffix, isCorpusLayoutPath } from "./corpus-file";
import type { Immutable } from "./contracts";
import type { ToolUse } from "./transcript";
import { filesRead, skillsInvoked } from "./transcript";

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
 * A `Read` tool_use never carries a bare layout path: the session reads a real
 * file, so `input.file_path` is absolute, either under the live install
 * (`~/.claude/<layoutPath>`) or under an attempt's corpus overlay
 * (`<attemptDirectory>/.claude/<layoutPath>`, `session-corpus.ts`). Both
 * shapes share the `.claude/` segment immediately before the layout path, so
 * the manifest entry is the suffix after the last one, not the read path
 * itself.
 */
function readCorpusLayoutPath(path: string): string | undefined {
	if (isCorpusLayoutPath(path)) {
		return path;
	}

	const suffix = corpusLayoutSuffix(path);

	return suffix !== undefined && isCorpusLayoutPath(suffix)
		? suffix
		: undefined;
}

/**
 * A corpus file always resolves under a `.claude/` segment (the live install or
 * the attempt's corpus overlay, `readCorpusLayoutPath` above); a project file
 * never does, since `seedFixture` copies it onto the attempt directory's own
 * root. Excluding a path the corpus classifier already claims keeps one Read
 * from tagging both halves at once, and rules out the one case this suffix
 * match would otherwise get wrong for a single-segment declared name.
 *
 * A multi-segment declared name (`a/NOTES.md`) still suffix-matches a Read at
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

export function observedManifest(
	uses: Immutable<readonly ToolUse[]>,
	styles: readonly string[],
	declaredProjectFiles: readonly string[] = [],
): ContextManifest {
	const skillPaths = skillsInvoked(uses).map(
		(skill) => `skills/${skill}/SKILL.md`,
	);
	const readPaths = filesRead(uses)
		.map((path) => readCorpusLayoutPath(path))
		.filter((path) => path !== undefined);
	const projectPaths = filesRead(uses)
		.map((path) => readProjectLayoutPath(path, declaredProjectFiles))
		.filter((path) => path !== undefined);
	const stylePath = outputStyleLayoutPath(styles);

	const entries: ManifestEntry[] = [
		...corpusEntries(skillPaths),
		...corpusEntries(readPaths),
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
