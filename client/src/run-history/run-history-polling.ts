import type { RunHistoryResponse } from "./run-history-query";
import { runHistoryQuery } from "./run-history-query";

/**
 * How often the list re-reads itself while a run is in flight. The operator is
 * watching readings move, so the interval has to be shorter than the attention
 * span of someone staring at a screen; the route's cost is reading every saved
 * record under the runs directory, one liveness probe per candidate run, and
 * judging every record's staleness against the corpus under test, about a third
 * of a second for a hundred records.
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
	response: Readonly<RunHistoryResponse> | undefined,
): boolean {
	return (
		(response?.launches ?? []).some((launch) => launch.status === "RUNNING") ||
		(response?.rows ?? []).some(
			(row) => row.kind === "run" && row.progress.state === "running",
		)
	);
}

/**
 * The run-history query, re-read often while anything runs and seldom while
 * nothing does, for every reader that shows readings of a run in flight.
 */
export const polledRunHistoryQuery = {
	...runHistoryQuery,
	refetchInterval: ({
		state,
	}: {
		readonly state: { readonly data?: RunHistoryResponse | undefined };
	}): number => (somethingRuns(state.data) ? RUNNING_POLL_MS : IDLE_POLL_MS),
};
