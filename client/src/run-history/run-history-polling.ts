import type { RunHistoryResponse } from "./run-history-query";

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
