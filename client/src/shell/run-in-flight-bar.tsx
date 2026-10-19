import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { polledRunListingQuery } from "#client/run-history/run-history-polling";
import type { RunListingResponse } from "#client/run-history/run-history-query";

import RunReadings from "./active-run-reading";
import {
	announcements,
	runsInFlight,
	withGradesKnownBefore,
} from "./run-in-flight";

const EMPTY_COLLECTION_LENGTH = 0;

type HistoryRow = RunListingResponse["rows"][number];

/** One array for every render before the history loads, so it reads as unchanged. */
const NO_ROWS: readonly HistoryRow[] = [];

/**
 * What a screen reader is told between readings. The earlier reading is kept
 * from the last render rather than an effect, so the message lands in the
 * same render as the readings it speaks of, and a reading that says nothing
 * new leaves the last message in place instead of clearing and repeating it.
 * A run whose latest reading could not read its stages keeps the stages last
 * read, so the next readable one does not announce them all again.
 */
function useAnnouncement(rows: readonly HistoryRow[]): string {
	const [seen, setSeen] = useState(rows);
	const [previous, setPrevious] = useState(rows);
	const [message, setMessage] = useState("");
	if (seen !== rows) {
		setSeen(rows);
		setPrevious(withGradesKnownBefore(previous, rows));
		const said = announcements(previous, rows);
		if (said.length > EMPTY_COLLECTION_LENGTH) {
			setMessage(said.join(". "));
		}
	}

	return message;
}

/**
 * One bar per run in flight, newest first. The live region stays mounted when
 * no run is in flight, since a stop is announced after the bar that showed the
 * run leaves.
 */
interface RunInFlightProps {
	readonly rows: readonly HistoryRow[];
}

function RunInFlight({ rows }: RunInFlightProps): React.JSX.Element {
	const message = useAnnouncement(rows);
	const running = runsInFlight(rows);

	return (
		<>
			{running.length === EMPTY_COLLECTION_LENGTH ? null : (
				<section
					aria-label="Active runs"
					tabIndex={0}
					className="relative max-h-1/4 shrink-0 overflow-y-auto overscroll-y-contain focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
				>
					{running.map((row) => (
						<RunReadings key={row.run} row={row} />
					))}
				</section>
			)}
			<p role="status" aria-live="polite" className="sr-only">
				{message}
			</p>
		</>
	);
}

/** The runs in flight, read from the run history every screen shares. */
function RunInFlightBar(): React.JSX.Element {
	const { data } = useQuery(polledRunListingQuery);

	return <RunInFlight rows={data?.rows ?? NO_ROWS} />;
}

export { RunInFlight, RunInFlightBar };
