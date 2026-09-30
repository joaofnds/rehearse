import type { RunHistoryResponse } from "./run-history-query";
import { runHistoryQuery } from "./run-history-query";

/**
 * How often the list re-reads itself while a run is in flight. The operator is
 * watching readings move, so the interval has to be shorter than the attention
 * span of someone staring at a screen; the route's cost is reading every saved
 * record under the runs directory, one liveness probe per candidate run, and
 * judging every record's staleness against the corpus under test, about a third
 * of a second for a hundred records. Polling stops when no run is running, so a
 * page left open on finished history costs nothing.
 */
const RUNNING_POLL_MS = 2000;

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
 * The run-history query re-read while anything runs, for every reader that
 * shows readings of a run in flight.
 */
export const polledRunHistoryQuery = {
	...runHistoryQuery,
	refetchInterval: ({
		state,
	}: {
		readonly state: { readonly data?: RunHistoryResponse | undefined };
	}): number | false => (somethingRuns(state.data) ? RUNNING_POLL_MS : false),
};
