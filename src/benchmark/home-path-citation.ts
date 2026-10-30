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

function isHeld(layoutPath: string, held: ReadonlySet<string>): boolean {
	return (
		held.has(layoutPath) ||
		[...held].some((path) => path.startsWith(`${layoutPath}/`))
	);
}

/**
 * The text an arm's install delivers: each citation of a file or directory
 * the install holds, written through the user's home directory, names the
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
			const path = written.replace(/\.+$/u, "");
			const trailing = written.slice(path.length);
			const absolute = posix.normalize(`${map.home}${path}`);
			const slash = absolute.endsWith("/") ? "/" : "";
			const layoutPath = layoutPathOf(absolute.replace(/\/$/u, ""), map.roots);
			if (layoutPath === undefined || !isHeld(layoutPath, held)) {
				return citation;
			}

			redirected.push(layoutPath);

			return `.claude/${layoutPath}${slash}${trailing}`;
		},
	);

	return { redirected: redirected.length, text: delivered };
}

export { deliverHomePathCitations as default };
export type { DeliveredCorpusText, HomePathCitationMap, HomePathCitationRoot };
