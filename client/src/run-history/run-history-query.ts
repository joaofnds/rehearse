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

async function fetchRunHistoryReport(): Promise<RunHistoryResponse> {
	const response = await apiClient.api.runs.$get();

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
