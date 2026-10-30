import { posix } from "node:path";

/** An absolute path in the live install and the layout path it holds. */
interface HomePathCitationRoot {
	readonly path: string;
	readonly layoutPath: string;
}

interface HomePathCitationMap {
	readonly home: string;
	readonly roots: readonly HomePathCitationRoot[];
}

interface DeliveredCorpusText {
	readonly text: string;
	readonly redirected: number;
}

function escaped(literal: string): string {
	return literal.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function citationPattern(home: string): RegExp {
	return new RegExp(
		String.raw`(?<![\w~$/.])(?:~|\$HOME|\$\{HOME\}|${escaped(home)})(/[\w./-]*)`,
		"gu",
	);
}

function layoutPathOf(
	absolute: string,
	roots: readonly HomePathCitationRoot[],
): string | undefined {
	const [root] = roots
		.filter(({ path }) => absolute === path || absolute.startsWith(`${path}/`))
		.toSorted((left, right) => right.path.length - left.path.length);

	return root === undefined
		? undefined
		: posix.join(root.layoutPath, absolute.slice(root.path.length));
}

/**
 * Whether the install holds what the layout path names: a held file, or
 * anything inside a directory it holds whole, present or not, so a file an
 * arm deletes is missed in the arm's copy rather than read live. A directory
 * the install holds only part of stays live, since its other entries are the
 * user's.
 */
function isHeld(layoutPath: string, held: ReadonlySet<string>): boolean {
	return [...held].some(
		(path) => layoutPath === path || layoutPath.startsWith(`${path}/`),
	);
}

interface HeldCitation {
	readonly layoutPath: string;
	readonly replacement: string;
}

const ONE_CHARACTER = 1;

const START = 0;

const PARENT_STEP = "..";

/**
 * The citation without the dots that end its sentence. A `..` after a slash
 * is a path step, so it stays.
 */
function withoutClosingPunctuation(written: string): string {
	let end = written.length;
	while (written.at(end - ONE_CHARACTER) === ".") {
		end -= ONE_CHARACTER;
	}

	const isParentStep =
		written.at(end - ONE_CHARACTER) === "/" &&
		written.length - end >= PARENT_STEP.length;

	return isParentStep ? written : written.slice(START, end);
}

function heldCitation(
	written: string,
	map: HomePathCitationMap,
	held: ReadonlySet<string>,
): HeldCitation | undefined {
	const path = withoutClosingPunctuation(written);
	const trailing = written.slice(path.length);
	const absolute = posix.normalize(`${map.home}${path}`);
	const slash = absolute.endsWith("/") ? "/" : "";
	const layoutPath = layoutPathOf(absolute.replace(/\/$/u, ""), map.roots);
	if (layoutPath === undefined || !isHeld(layoutPath, held)) {
		return undefined;
	}

	return {
		layoutPath,
		replacement: `.claude/${layoutPath}${slash}${trailing}`,
	};
}

/** The layout path of each citation in `text` of a file `held` names. */
function heldCitations(
	text: string,
	map: HomePathCitationMap,
	held: ReadonlySet<string>,
): readonly string[] {
	return [...text.matchAll(citationPattern(map.home))]
		.map(([, written = ""]) => heldCitation(written, map, held)?.layoutPath)
		.filter((layoutPath) => layoutPath !== undefined);
}

/**
 * The text an arm's install delivers: each citation of a file or directory
 * the install holds, `held` naming each file and each directory it holds
 * whole, written through the user's home directory, names the
 * install's own copy instead, relative to the directory the session starts
 * in. A citation of anything the install does not hold is not under test and
 * still reaches the user's live file.
 */
function deliverHomePathCitations(
	text: string,
	map: HomePathCitationMap,
	held: ReadonlySet<string>,
): DeliveredCorpusText {
	const redirected: string[] = [];
	const delivered = text.replaceAll(
		citationPattern(map.home),
		(citation: string, written: string) => {
			const found = heldCitation(written, map, held);
			if (found === undefined) {
				return citation;
			}

			redirected.push(found.layoutPath);

			return found.replacement;
		},
	);

	return { redirected: redirected.length, text: delivered };
}

export { deliverHomePathCitations as default, heldCitations };
export type { DeliveredCorpusText, HomePathCitationMap, HomePathCitationRoot };
