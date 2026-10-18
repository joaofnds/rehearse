import type { RecordStaleness } from "#benchmark/staleness-report";
import type { Reading } from "./run-record";

/** The list's corpus judgment, without the detailed read evidence served by context views. */
export type RowStaleness = Reading<
	Omit<RecordStaleness, "id" | "readFiles" | "readManifest">
>;

export const UNJUDGED_REASON = "nothing recorded to judge";
