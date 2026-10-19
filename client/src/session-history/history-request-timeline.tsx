import type {
	SessionHistoryEvent,
	SessionHistoryRequestEntry,
} from "#benchmark/session-history";

import type { EventFilter } from "./evidence-discovery";
import type { RequestSeriesResponse } from "./history-report-query";
import {
	RequestTimeline,
	requestRowForLine,
	requestRowId,
} from "./request-timeline";

const INCLUSIVE_LINE_RANGE_ADJUSTMENT = 1;

/**
 * The first event the request owns, bounded above by the next request's line.
 * Without that bound a request that produced no event of its own, which is
 * every text-only assistant reply, selects the next request's event, and the
 * pane then highlights that other row rather than the one clicked.
 */
function eventForRequestRow(
	entries: readonly SessionHistoryRequestEntry[],
	events: readonly SessionHistoryEvent[],
	entry: Readonly<SessionHistoryRequestEntry>,
): SessionHistoryEvent | undefined {
	return events.find(
		({ locator }) =>
			locator.line >= entry.line &&
			requestRowForLine(entries, locator.line) === requestRowId(entry),
	);
}

/**
 * The same ownership rule read a third way: a request stays visible when any
 * visible event belongs to it. Matching an event's line against a request's own
 * line instead would hide a request whose events all sit on later lines, which
 * is every request in a real transcript.
 */
function requestRowsOwningEvents(
	entries: readonly SessionHistoryRequestEntry[],
	events: readonly SessionHistoryEvent[],
): readonly SessionHistoryRequestEntry[] {
	const owning = new Set(
		events.map(({ locator }) => requestRowForLine(entries, locator.line)),
	);

	return entries.filter((entry) => owning.has(requestRowId(entry)));
}

function unfilteredRequests(
	sourceId: string | undefined,
	query: string,
	filter: EventFilter,
): boolean {
	return (
		sourceId === undefined &&
		query.trim() === "" &&
		(filter === "Activity" || filter === "All records")
	);
}

/**
 * A record that never held a request series is a different fact from one whose
 * series failed to load, and only the second is something the operator can act
 * on.
 */
function timelineNote(failed: boolean, recorded: boolean): string {
	if (!recorded) {
		return "A saved stage or replay records no request series; raw transcript history cannot be reconstructed.";
	}

	return failed
		? "Could not load the request timeline."
		: "Loading the request timeline…";
}

interface RequestTimelineStatusProps {
	readonly failed: boolean;
	readonly recorded: boolean;
}

function RequestTimelineStatus({
	failed,
	recorded,
}: RequestTimelineStatusProps): React.JSX.Element {
	return (
		<section aria-label="Request timeline">
			<p
				className={`rounded-md border px-3 py-2.5 text-14 ${failed || !recorded ? "border-attention bg-attention-surface text-attention" : "bg-muted text-muted-foreground"}`}
				role={failed && recorded ? "alert" : undefined}
			>
				{timelineNote(failed, recorded)}
			</p>
		</section>
	);
}

interface RequestTimelinePaneProps {
	readonly read: RequestSeriesResponse | undefined;
	readonly failed: boolean;
	readonly recorded: boolean;
	readonly entries: readonly SessionHistoryRequestEntry[];
	readonly selected: string | undefined;
	readonly onSelect: (entry: SessionHistoryRequestEntry) => void;
}

function RequestTimelinePane({
	read,
	failed,
	recorded,
	entries,
	selected,
	onSelect,
}: RequestTimelinePaneProps): React.JSX.Element {
	if (read === undefined) {
		return <RequestTimelineStatus failed={failed} recorded={recorded} />;
	}

	return (
		<RequestTimeline
			series={read.series}
			entries={entries}
			requestCosts={read.requestCosts}
			instructionLoads={read.instructionLoads}
			selected={selected}
			onSelect={onSelect}
		/>
	);
}

export {
	INCLUSIVE_LINE_RANGE_ADJUSTMENT,
	RequestTimelinePane,
	RequestTimelineStatus,
	eventForRequestRow,
	requestRowsOwningEvents,
	unfilteredRequests,
};
