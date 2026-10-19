import type { InferResponseType } from "hono/client";

import type { apiClient } from "#client/api-client";
import type HTTP_STATUS from "#client/http-status";
import plural from "#client/plural";

import type { RunHistoryResponse } from "./run-history-query";
import { spendReading } from "./run-progress";

const SINGLE_FAILED_CHECK_COUNT = 1;

const NO_MISSING_ITEMS = 0;

const SINGLE_ITEM_COUNT = 1;

const NO_GRADED_REPS = 0;

const NO_RECORDED_COST_USD = 0;

const PREFIX_START_INDEX = 0;

const NO_SPEND_USD = 0;

const EMPTY_COLLECTION_LENGTH = 0;

const GROUP_ID_PREVIEW_CHARACTERS = 8;

type GroupRow = Extract<RunHistoryResponse["rows"][number], { kind: "group" }>;

type GroupReads = InferResponseType<
	(typeof apiClient.api.groups)[":groupId"]["reads"]["$get"],
	typeof HTTP_STATUS.ok
>;

function costLine(row: GroupRow): string {
	if (row.cost.state === "unavailable") {
		return `Cost unavailable: ${row.cost.reasons.join("; ")}`;
	}
	return `Recorded group total ${spendReading(row.cost.usd)}${row.cost.missing.length === EMPTY_COLLECTION_LENGTH ? ` · mean ${spendReading(row.cost.usd / row.reps)} per requested rep, including preflight` : ` · mean unavailable (${plural(row.cost.missing.length, "missing cost part")})`}`;
}

export {
	costLine,
	EMPTY_COLLECTION_LENGTH,
	GROUP_ID_PREVIEW_CHARACTERS,
	NO_GRADED_REPS,
	NO_MISSING_ITEMS,
	NO_RECORDED_COST_USD,
	NO_SPEND_USD,
	PREFIX_START_INDEX,
	SINGLE_FAILED_CHECK_COUNT,
	SINGLE_ITEM_COUNT,
};
export type { GroupReads, GroupRow };
