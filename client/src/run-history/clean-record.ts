import type { RowStaleness } from "#server/run-history";

type JudgedStaleness = Extract<RowStaleness, { readonly state: "available" }>;

/** What deciding whether a record is clean reads of its staleness. */
export type CleanReading = Pick<JudgedStaleness, "stale" | "distance">;

/** Judged against the version under test, with nothing changed since. */
export function isClean(staleness: CleanReading): boolean {
	return (
		staleness.distance.kind === "measured" &&
		!staleness.stale &&
		staleness.distance.versions === 0
	);
}
