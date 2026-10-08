import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";

/**
 * The row shape comes from the server's own route type via Hono's RPC
 * client, `apiClient.api.runs.$get`, rather than a hand-declared schema
 * repeating what `src/server/run-history.ts`'s `RunHistoryRow` already
 * states (decision-3's stated reason for choosing Hono).
 */
export type RunHistoryResponse = InferResponseType<
	typeof apiClient.api.runs.$get
>;

/** A pipeline run's row as the full report answers it, staleness included. */
export type RunRowWithStaleness = Extract<
	RunHistoryResponse["rows"][number],
	{ readonly kind: "run" }
>;

async function fetchRunHistoryReport(): Promise<RunHistoryResponse> {
	const response = await apiClient.api.runs.$get();
	if (!response.ok) {
		throw new Error("Could not load run history");
	}

	return response.json();
}

/**
 * The run-history query, shared by the screen and the nav badge that counts
 * its rows, so the badge reads the same cache entry as the list it links to
 * (SPEC.md:78).
 */
export const runHistoryQuery = {
	queryKey: ["run-history"],
	queryFn: fetchRunHistoryReport,
} as const;

/** The run history's rows without their staleness judgment. */
export type RunListingResponse = InferResponseType<
	(typeof apiClient.api)["run-listing"]["$get"]
>;

async function fetchRunListing(): Promise<RunListingResponse> {
	const response = await apiClient.api["run-listing"].$get();
	if (!response.ok) {
		throw new Error("Could not load run history");
	}

	return response.json();
}

/**
 * The run history for a reader that never shows staleness, which costs most
 * of the full report. Its key sits under `runHistoryQuery`'s, so every
 * invalidation of the run history refreshes it too.
 */
export const runListingQuery = {
	queryKey: [...runHistoryQuery.queryKey, "listing"],
	queryFn: fetchRunListing,
} as const;
