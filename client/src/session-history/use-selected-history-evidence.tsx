import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type {
	SessionHistoryEvent,
	SessionHistoryReport,
	SessionHistoryRequestEntry,
} from "#benchmark/session-history";

import {
	filterEvidenceEvents,
	preferredEvidenceEvent,
} from "./evidence-discovery";
import { fetchDetail } from "./history-evidence-queries";
import type {
	HistoryReads,
	InvestigationControls,
	SelectedEvidence,
	SessionHistoryIdentity,
} from "./history-investigation-contract";
import {
	requestRowsOwningEvents,
	unfilteredRequests,
} from "./history-request-timeline";
import { requestRowForLine } from "./request-timeline";

function useSelectedEvidence({
	identity,
	path,
	reads,
	controls,
}: HistoryEvidenceQueryRequest): SelectedEvidence {
	const events = useMemo(
		() => filteredHistoryEvents(reads.summary.data, controls),
		[
			controls.sourceId,
			reads.summary.data,
			controls.eventQuery,
			controls.eventFilter,
		],
	);
	const activeEventId = preferredEvidenceEvent(
		events,
		controls.selectedEventId,
	)?.id;
	const detail = useQuery({
		enabled: reads.servesEventDetail && activeEventId !== undefined,
		queryFn: async () => await fetchDetail(identity, activeEventId ?? ""),
		queryKey: ["session-history-detail", path, activeEventId],
	});
	const timelineEntries = reads.requests.data?.series.entries ?? [];
	const selectedRequestRow = selectedTimelineRequest(
		timelineEntries,
		{ activeEventId, events },
		controls,
	);

	const visibleEntries = visibleRequestEntries(
		timelineEntries,
		events,
		controls,
	);
	return {
		activeEventId,
		detail,
		events,
		selectedRequestRow,
		timelineEntries,
		visibleEntries,
	};
}

interface HistoryEvidenceQueryRequest {
	readonly identity: SessionHistoryIdentity;
	readonly path: string;
	readonly reads: HistoryReads;
	readonly controls: InvestigationControls;
}

function filteredHistoryEvents(
	report: SessionHistoryReport | undefined,
	controls: InvestigationControls,
): readonly SessionHistoryEvent[] {
	let all: readonly SessionHistoryEvent[] = [];
	if (report !== undefined) {
		all =
			report.boundary === "unknown"
				? report.boundaryUnknown
				: report.attemptEvents;
	}
	const scoped =
		controls.sourceId === undefined
			? all
			: all.filter((event) => event.sourceId === controls.sourceId);
	return filterEvidenceEvents(
		scoped,
		controls.eventQuery,
		controls.eventFilter,
	);
}

function visibleRequestEntries(
	timelineEntries: readonly SessionHistoryRequestEntry[],
	events: readonly SessionHistoryEvent[],
	controls: InvestigationControls,
): readonly SessionHistoryRequestEntry[] {
	return unfilteredRequests(
		controls.sourceId,
		controls.eventQuery,
		controls.eventFilter,
	)
		? timelineEntries
		: requestRowsOwningEvents(timelineEntries, events);
}

function selectedTimelineRequest(
	timelineEntries: readonly SessionHistoryRequestEntry[],
	selection: Pick<SelectedEvidence, "events" | "activeEventId">,
	controls: InvestigationControls,
): string | undefined {
	const { events, activeEventId } = selection;
	const selectedEvent = events.find(({ id }) => id === activeEventId);
	/**
	 * Both panes key off the transcript line: a request and the events recorded
	 * for it share one, which is the only identifier the two readings have in
	 * common. Filtering the event pane therefore narrows the timeline too.
	 */
	return (
		controls.selectedRequestId ??
		requestRowForLine(timelineEntries, selectedEvent?.locator.line)
	);
}

export { useSelectedEvidence as default };
