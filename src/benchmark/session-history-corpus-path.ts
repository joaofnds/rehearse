import { resolve } from "node:path";

import { corpusLayoutSuffix, isCorpusLayoutPath } from "./corpus-file";
import pathIsWithin from "./path-containment";
import type {
	CorpusFileLocation,
	SessionHistoryAttemptIdentity,
} from "./session-history-contract";

const PREFIX_START_INDEX = 0;

/**
 * A caller with no resolved corpus paths has only the read path to go on. Both
 * corpus roots a stage can read from, the live install and a worktree overlay,
 * put the layout path after a `.claude/` segment, so that suffix is the name
 * the checkpoint's declared entries are already written in.
 *
 * The `.claude` directory must sit directly under the working directory or
 * outside it entirely, never nested below `cwd`. A repository's own vendored
 * `.claude` is a project file, and naming its `CLAUDE.md` as the declared
 * corpus entry would report a file as observed on the evidence of a read of a
 * different file.
 *
 * Applying this to a session attempt is what `declaredCorpusPath` refuses: it
 * would move reads whose resolved paths already answer the question.
 */
function corpusLayoutPathUnder(
	normalizedPath: string,
	normalizedCwd: string | undefined,
): string | undefined {
	const suffix = corpusLayoutSuffix(normalizedPath);
	if (suffix === undefined || !isCorpusLayoutPath(suffix)) {
		return undefined;
	}

	const corpusRoot = normalizedPath.slice(
		PREFIX_START_INDEX,
		-`/${suffix}`.length,
	);
	if (
		normalizedCwd !== undefined &&
		pathIsWithin(corpusRoot, normalizedCwd) &&
		corpusRoot !== resolve(normalizedCwd, ".claude")
	) {
		return undefined;
	}

	return suffix;
}

interface CorpusPathObservation {
	readonly kind: SessionHistoryAttemptIdentity["kind"];
	readonly normalizedObserved: string | undefined;
	readonly normalizedCwd: string | undefined;
}

/**
 * The corpus name for a read, from the evidence the record holds. A session
 * attempt resolved its corpus to real paths before it ran and gets an exact
 * match; a stage holds hashes and no paths, whichever state its record rests
 * in, so only there does the layout rule apply.
 *
 * The discriminant is the record kind, not whether the resolved list happens to
 * be empty. A session case may legitimately declare no corpus files, and its
 * reads must keep classifying as they did.
 */
function declaredCorpusPath(
	{ kind, normalizedObserved, normalizedCwd }: CorpusPathObservation,
	resolvedCorpusFiles: readonly CorpusFileLocation[],
): string | undefined {
	if (normalizedObserved === undefined) {
		return undefined;
	}

	if (
		kind === "stage" ||
		kind === "stopped-stage" ||
		kind === "awaiting-judge-stage"
	) {
		return corpusLayoutPathUnder(normalizedObserved, normalizedCwd);
	}

	return resolvedCorpusFiles.find(
		({ resolvedPath }) => resolve(resolvedPath) === normalizedObserved,
	)?.path;
}

export { declaredCorpusPath as default };
