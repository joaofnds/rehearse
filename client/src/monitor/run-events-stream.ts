import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { runHistoryQuery } from "#client/run-history/run-history-query";
import { runRecordQuery } from "./run-record-query";

/**
 * While the run is in flight, each event it records refetches the run history
 * row and the run record, so the monitor moves when an event lands rather
 * than on the next poll. The stream closes once the row stops reading as
 * running, since the server ends it at the run's terminal event and a browser
 * EventSource would reconnect and replay the whole run.
 */
export function useRunEventsStream(run: string, running: boolean): void {
	const client = useQueryClient();

	useEffect(() => {
		if (!running) {
			return undefined;
		}

		const source = new EventSource(
			`/api/runs/${encodeURIComponent(run)}/events`,
		);
		source.addEventListener("message", () => {
			void client.invalidateQueries({ queryKey: runHistoryQuery.queryKey });
			void client.invalidateQueries({ queryKey: runRecordQuery(run).queryKey });
		});

		return () => {
			source.close();
		};
	}, [client, run, running]);
}
