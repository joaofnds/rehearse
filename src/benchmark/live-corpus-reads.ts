import { z } from "zod";

import type { Immutable } from "./contracts";
import type { HomePathCitationMap } from "./home-path-citation";
import { heldCitations } from "./home-path-citation";
import type { ToolUse } from "./transcript-message-contract";

/** A live copy of a file under test, by layout path, and how many calls named it. */
interface LiveCorpusRead {
	readonly path: string;
	readonly count: number;
}

const NO_CALLS = 0;

const ONE_CALL = 1;

function accessField(field: string): z.ZodType<string> {
	return z
		.looseObject({ [field]: z.string() })
		.transform((input) => String(input[field]));
}

/**
 * The input field through which each file-access tool names a path. A path in
 * an agent prompt, skill arguments or written content is a mention, not an
 * access, so those tools and fields are not read.
 */
const ACCESS_FIELDS = new Map([
	["Bash", accessField("command")],
	["Edit", accessField("file_path")],
	["Glob", accessField("path")],
	["Grep", accessField("path")],
	["NotebookEdit", accessField("notebook_path")],
	["Read", accessField("file_path")],
	["Write", accessField("file_path")],
]);

function accessedText(use: Immutable<ToolUse>): string | undefined {
	const parsed = ACCESS_FIELDS.get(use.name)?.safeParse(use.input);

	return parsed?.success === true ? parsed.data : undefined;
}

/**
 * The calls that reached past the install to the live copy of a file or
 * directory it holds, which a citation the delivery rule missed or a path the
 * session built itself would make. Only layout paths and counts are kept,
 * never the command text, which can carry anything the session typed.
 */
function liveCorpusReads(
	uses: Immutable<readonly ToolUse[]>,
	citations: HomePathCitationMap,
	held: ReadonlySet<string>,
): readonly LiveCorpusRead[] {
	const counts = new Map<string, number>();
	for (const use of uses) {
		const text = accessedText(use);
		const named = new Set(
			text === undefined ? [] : heldCitations(text, citations, held),
		);
		for (const path of named) {
			counts.set(path, (counts.get(path) ?? NO_CALLS) + ONE_CALL);
		}
	}

	return [...counts]
		.map(([path, count]) => ({ count, path }))
		.toSorted((left, right) => left.path.localeCompare(right.path));
}

export { liveCorpusReads as default };
export type { LiveCorpusRead };
