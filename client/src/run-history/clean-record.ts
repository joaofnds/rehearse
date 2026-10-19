import type { RowStaleness } from "#server/run-history";

const CURRENT_CORPUS_VERSION_DISTANCE = 0;

type JudgedStaleness = Extract<RowStaleness, { readonly state: "available" }>;

/** What deciding whether a record is clean reads of its staleness. */
type CleanReading = Pick<JudgedStaleness, "stale" | "distance">;

/** Judged against the version under test, with nothing changed since. */
function isClean(staleness: CleanReading): boolean {
	return (
		staleness.distance.kind === "measured" &&
		!staleness.stale &&
		staleness.distance.versions === CURRENT_CORPUS_VERSION_DISTANCE
	);
}

export { isClean as default };
export type { CleanReading };
