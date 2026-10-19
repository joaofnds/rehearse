import type { InferResponseType } from "hono/client";

import { apiClient } from "#client/api-client";

/**
 * The row shape comes from the server's own route type via Hono's RPC
 * client, `apiClient.api.runs.$get`, rather than a hand-declared schema
 * repeating what `src/server/run-history.ts`'s `RunHistoryRow` already
 * states (decision-3's stated reason for choosing Hono).
 */
type RunHistoryResponse = InferResponseType<typeof apiClient.api.runs.$get>;

/** A pipeline run's row as the full report answers it, staleness included. */
type PipelineRowWithStaleness = Extract<
	RunHistoryResponse["rows"][number],
	{ readonly kind: "run" }
>;

async function fetchRunHistoryReport(): Promise<RunHistoryResponse> {
	const response = await apiClient.api.runs.$get();
	if (!response.ok) {
		throw new Error("Could not load run history");
	}

	return await response.json();
}

/**
 * The run-history query with every record's staleness judged, for the screens
 * that show it. The nav badge counts `runListingQuery`'s entries instead, which
 * are the same records and launches, so it agrees with the list it links to
 * (SPEC.md:78) once both readings settle.
 */
const runHistoryQuery = {
	queryFn: fetchRunHistoryReport,
	queryKey: ["run-history"],
} as const;

/** The run history's rows without their staleness judgment. */
type RunListingResponse = InferResponseType<
	(typeof apiClient.api)["run-listing"]["$get"]
>;

async function fetchRunListing(): Promise<RunListingResponse> {
	const response = await apiClient.api["run-listing"].$get();
	if (!response.ok) {
		throw new Error("Could not load run history");
	}

	return await response.json();
}

/**
 * The run history for a reader that never shows staleness, which costs most
 * of the full report. Its key sits under `runHistoryQuery`'s, so every
 * invalidation of the run history refreshes it too.
 */
const runListingQuery = {
	queryFn: fetchRunListing,
	queryKey: [...runHistoryQuery.queryKey, "listing"],
} as const;

async function fetchRunStaleness(): Promise<
	InferResponseType<(typeof apiClient.api)["run-staleness"]["$get"]>
> {
	const response = await apiClient.api["run-staleness"].$get();
	if (!response.ok) {
		throw new Error("Could not check run freshness");
	}

	return await response.json();
}

const runStalenessQuery = {
	queryFn: fetchRunStaleness,
	queryKey: [...runHistoryQuery.queryKey, "staleness"],
} as const;

/**
 * How many entries the run history lists unfiltered, its record rows and its
 * launch rows together, as the table shows both. A stopped launch whose run
 * also recorded counts twice, since the table lists it twice.
 */
interface ListedEntryCountProps {
	readonly rows: readonly unknown[];
	readonly launches: readonly unknown[];
}

function listedEntryCount(history: ListedEntryCountProps): number {
	return history.rows.length + history.launches.length;
}

export {
	listedEntryCount,
	runHistoryQuery,
	runListingQuery,
	runStalenessQuery,
};
export type {
	PipelineRowWithStaleness,
	RunHistoryResponse,
	RunListingResponse,
};
