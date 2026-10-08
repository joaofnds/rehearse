import type { RunListingResponse } from "./run-history-query";
import { runHistoryQuery, runListingQuery } from "./run-history-query";

/**
 * How often the list re-reads itself while a run is in flight. The operator is
 * watching readings move, so the interval has to be shorter than the attention
 * span of someone staring at a screen. Both readings read every saved record
 * under the runs directory and probe the liveness of each candidate run, and
 * the full report also judges every record's staleness against the corpus
 * under test. Over HTTP on 163 stored records (2026-10-08) the listing took
 * 138 to 148 ms and the full report 1.48 to 1.60 s, most of this interval, so
 * only the screens that show staleness pay for it. Both grow with the number
 * of stored records.
 */
const RUNNING_POLL_MS = 2000;

/**
 * How often the list re-reads itself while nothing runs. Every screen shows a
 * run in flight, including one started from a terminal after the page opened,
 * and nothing but this read tells the page one has started. Longer than
 * RUNNING_POLL_MS so a page left open on finished history costs a fifth as
 * much. No source sets the figure.
 */
const IDLE_POLL_MS = 10_000;

/**
 * Whether anything the list shows is still running: a browser launch whose
 * process is alive, or a pipeline run in progress. A launch the operator
 * stopped stays listed after its process ends, so it does not count.
 */
export function somethingRuns(
	response: Readonly<RunListingResponse> | undefined,
): boolean {
	return (
		(response?.launches ?? []).some((launch) => launch.status === "RUNNING") ||
		(response?.rows ?? []).some(
			(row) => row.kind === "run" && row.progress.state === "running",
		)
	);
}

/** Often while anything runs and seldom while nothing does. */
function pollInterval({
	state,
}: {
	readonly state: { readonly data?: RunListingResponse | undefined };
}): number {
	return somethingRuns(state.data) ? RUNNING_POLL_MS : IDLE_POLL_MS;
}

/**
 * The run-history query, polled for the screens that show readings of a run
 * in flight beside each record's staleness.
 */
export const polledRunHistoryQuery = {
	...runHistoryQuery,
	refetchInterval: pollInterval,
};

/** The run listing, polled for every other reader of a run in flight. */
export const polledRunListingQuery = {
	...runListingQuery,
	refetchInterval: pollInterval,
};
