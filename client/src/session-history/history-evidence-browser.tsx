import { useEffect, useRef } from "react";

import type { SessionHistoryReport } from "#benchmark/session-history";
import NativeSelect from "#client/system/ui/native-select";
import SearchInput from "#client/system/ui/search-input";

import { EVENT_FILTERS } from "./evidence-discovery";
import { EventLedger } from "./history-event-ledger";
import type {
	InvestigationControls,
	SelectedEvidence,
} from "./history-investigation-contract";
import PaneHeading from "./pane-heading";
import { selectEvidenceEvent } from "./use-investigation-selection";

interface HistoryEventsPaneProps {
	readonly report: SessionHistoryReport;
	readonly controls: InvestigationControls;
	readonly evidence: SelectedEvidence;
	readonly revealEvents: boolean;
}

function HistoryEventsPane({
	report,
	controls,
	evidence,
	revealEvents,
}: HistoryEventsPaneProps): React.JSX.Element {
	const eventsRef = useRef<HTMLElement>(null);
	useEffect(() => {
		if (revealEvents && report !== undefined) {
			eventsRef.current?.scrollIntoView?.({ block: "nearest" });
			eventsRef.current?.focus({ preventScroll: true });
		}
	}, [revealEvents, report]);
	return (
		<section
			ref={eventsRef}
			tabIndex={-1}
			aria-label="Event ledger"
			className="border-t focus-visible:outline-2 focus-visible:outline-primary"
		>
			<PaneHeading>
				{report.boundary === "unknown"
					? "Boundary-unknown events"
					: "Attempt events"}
			</PaneHeading>
			<HistoryEventFilters controls={controls} />
			<div className="max-h-80 overflow-y-auto">
				<EventLedger
					events={evidence.events}
					total={
						report.boundary === "unknown"
							? report.boundaryUnknown.length
							: report.attemptEvents.length
					}
					selected={evidence.activeEventId}
					onSelect={(id) => {
						selectEvidenceEvent(controls, id);
						controls.setView("Evidence");
					}}
				/>
			</div>
		</section>
	);
}

interface HistoryEventFiltersProps {
	readonly controls: InvestigationControls;
}

function HistoryEventFilters({
	controls,
}: HistoryEventFiltersProps): React.JSX.Element {
	return (
		<div className="flex flex-col gap-2 border-b px-3 py-3">
			<label className="flex flex-col gap-1 text-12 text-muted-foreground">
				Search events
				<SearchInput
					value={controls.eventQuery}
					onChange={(event) => {
						controls.setEventQuery(event.target.value);
					}}
					placeholder="Event, tool, or source"
				/>
			</label>
			<label className="flex flex-col gap-1 text-12 text-muted-foreground">
				Show events
				<NativeSelect
					value={controls.eventFilter}
					onChange={(event) => {
						const filter = EVENT_FILTERS.find(
							(value) => value === event.target.value,
						);
						if (filter !== undefined) {
							controls.setEventFilter(filter);
						}
					}}
				>
					{EVENT_FILTERS.map((filter) => (
						<option key={filter} value={filter}>
							{filter}
						</option>
					))}
				</NativeSelect>
			</label>
		</div>
	);
}

export { HistoryEventsPane as default };
