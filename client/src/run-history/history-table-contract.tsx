import type { RunHistoryResponse } from "./run-history-query";

const FIRST_AVAILABLE_LINK_INDEX = 0;

const SINGLE_CORPUS_VERSION_DISTANCE = 1;

const NO_LISTED_ENTRIES = 0;

const NO_FAILED_RESULTS = 0;

const NO_UNAVAILABLE_RESULTS = 0;

const NO_ASSESSED_RESULTS = 0;

const NO_RECORDED_DISAGREEMENTS = 0;

const NO_JUDGED_RESULTS = 0;

const NO_ACTIVE_FILTERS = 0;

const SORT_ORDER_AFTER = 1;

const SORT_ORDER_BEFORE = -1;

const SORT_ORDER_EQUAL = 0;

const MISSING_SEQUENCE_INDEX = -1;

const ORDINAL_BASE = 1;

const NO_FINAL_OUTCOME_RESULTS = 0;

const PREFIX_START_INDEX = 0;

const NO_REPORTED_OUTCOMES = 0;

const SINGLE_ITEM_COUNT = 1;

const EMPTY_COLLECTION_LENGTH = 0;

const COMPARISON_ARM_COUNT = 2;

const LAUNCH_ID_PREVIEW_CHARACTERS = 8;

type HistoryRow = RunHistoryResponse["rows"][number];

type RunHistoryRow = Extract<HistoryRow, { readonly kind: "run" }>;

type RunningProgress = Extract<
	RunHistoryRow["progress"],
	{ readonly state: "running" }
>;

type ContextLink = HistoryRow["links"][number];

function pipelineRuns(rows: readonly HistoryRow[]): readonly RunHistoryRow[] {
	return rows.filter((row): row is RunHistoryRow => row.kind === "run");
}

type LaunchRow = RunHistoryResponse["launches"][number];

const COLUMNS = [
	"Run",
	"Case",
	"Outcome",
	"Step grades",
	"Final outcome",
	"Corpus",
	"Cost",
	"Wall",
] as const;

const NUMERIC_COLUMNS = ["Cost", "Wall"] as const;

export {
	COLUMNS,
	COMPARISON_ARM_COUNT,
	EMPTY_COLLECTION_LENGTH,
	FIRST_AVAILABLE_LINK_INDEX,
	LAUNCH_ID_PREVIEW_CHARACTERS,
	MISSING_SEQUENCE_INDEX,
	NO_ACTIVE_FILTERS,
	NO_ASSESSED_RESULTS,
	NO_FAILED_RESULTS,
	NO_FINAL_OUTCOME_RESULTS,
	NO_JUDGED_RESULTS,
	NO_LISTED_ENTRIES,
	NO_RECORDED_DISAGREEMENTS,
	NO_REPORTED_OUTCOMES,
	NO_UNAVAILABLE_RESULTS,
	NUMERIC_COLUMNS,
	ORDINAL_BASE,
	pipelineRuns,
	PREFIX_START_INDEX,
	SINGLE_CORPUS_VERSION_DISTANCE,
	SINGLE_ITEM_COUNT,
	SORT_ORDER_AFTER,
	SORT_ORDER_BEFORE,
	SORT_ORDER_EQUAL,
};
export type {
	ContextLink,
	HistoryRow,
	LaunchRow,
	RunHistoryRow,
	RunningProgress,
};
