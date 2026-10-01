import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { runHistoryQuery } from "#client/run-history/run-history-query";
import { runRecordQuery } from "./run-record-query";
import { stageSessionsQueryKey } from "./stage-session-query";

/**
 * Each event the run records refetches the run history row, the run record
 * and every stage session the monitor has read, so the monitor moves when an
 * event lands rather than on the next poll. A stage session that is not
 * running polls for nothing, yet it still changes: a queued stage starts, and
 * a closed stage gains its cited spans once its judge finishes and its
 * transcript's copy once it checkpoints, and the run records an event after
 * each. The server replays the run's every event on connect, so an event
 * arriving while a refetch is in flight joins it rather than restarting it,
 * and the replay costs one read of each. The monitor unmounts once the row
 * stops reading as running, which closes the stream before a browser
 * EventSource would reconnect and replay the whole run again.
 */
export function useRunEventsStream(run: string): void {
	const client = useQueryClient();

	useEffect(() => {
		const source = new EventSource(
			`/api/runs/${encodeURIComponent(run)}/events`,
		);
		source.addEventListener("message", () => {
			void client.invalidateQueries(
				{ queryKey: runHistoryQuery.queryKey },
				{ cancelRefetch: false },
			);
			void client.invalidateQueries(
				{ queryKey: runRecordQuery(run).queryKey },
				{ cancelRefetch: false },
			);
			void client.invalidateQueries(
				{ queryKey: stageSessionsQueryKey(run) },
				{ cancelRefetch: false },
			);
		});

		return () => {
			source.close();
		};
	}, [client, run]);
}
