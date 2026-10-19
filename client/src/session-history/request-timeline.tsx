import type {
	SessionHistoryRequestEntry,
	SessionHistoryRequestSeries,
} from "#benchmark/session-history";
import type { TranscriptInstructionLoads } from "#benchmark/transcript-instruction-loads";
import type { SessionHistoryRequestCostEntry } from "#server/session-history-reader";

import PaneHeading from "./pane-heading";
import RequestInputSummary from "./request-input-chart";
import { InstructionLoads, SelectedRequest } from "./request-input-readings";
import RequestTimelineGrid from "./request-timeline-grid";
import {
	compactingRequestIds,
	requestRowId,
	widestTotal,
} from "./request-timeline-selection";

interface RequestTimelineProps {
	readonly series: SessionHistoryRequestSeries;
	/** The rows to show, which the source filter narrows from series.entries. */
	readonly entries: readonly SessionHistoryRequestEntry[];
	readonly requestCosts: readonly SessionHistoryRequestCostEntry[];
	readonly instructionLoads: TranscriptInstructionLoads;
	readonly selected: string | undefined;
	readonly onSelect: (entry: SessionHistoryRequestEntry) => void;
}

function RequestTimeline({
	series,
	entries,
	requestCosts,
	instructionLoads,
	selected,
	onSelect,
}: RequestTimelineProps): React.JSX.Element {
	const widest = widestTotal(series.entries);
	const active = series.entries.find(
		(entry) => requestRowId(entry) === selected,
	);
	const compacted = compactingRequestIds(series.entries, series.compactions);
	const costByLine = new Map(
		requestCosts.map((entry) => [entry.line, entry.cost]),
	);

	return (
		<section aria-label="Request timeline">
			<PaneHeading>Request timeline · session root</PaneHeading>
			<RequestInputSummary
				series={series}
				entries={entries}
				selected={selected}
				onSelect={onSelect}
				widest={widest}
			/>
			<SelectedRequest
				entry={active}
				cost={active === undefined ? undefined : costByLine.get(active.line)}
			/>
			<p className="px-3 py-2.5 text-12 text-muted-foreground">
				{series.name}. The provider's active context window is not measured:
				this number omits {series.omits.join(" and ")}.
			</p>
			<RequestTimelineGrid
				series={series}
				entries={entries}
				selected={selected}
				onSelect={onSelect}
				widest={widest}
				costByLine={costByLine}
				compacted={compacted}
			/>
			<RequestInstructionLoads loads={instructionLoads} />
		</section>
	);
}

interface RequestInstructionLoadsProps {
	readonly loads: TranscriptInstructionLoads;
}

function RequestInstructionLoads({
	loads,
}: RequestInstructionLoadsProps): React.JSX.Element {
	return (
		<>
			<h3 className="px-3 pt-3">
				<span className="text-12 text-muted-foreground">
					Automatic instruction loads
				</span>
			</h3>
			<InstructionLoads loads={loads} />
		</>
	);
}

export {
	costHeadline,
	costLabel,
	CostReading,
	RequestCostReadings,
	usd,
} from "./request-cost-readings";
export { categories } from "./request-input-readings";
export { requestRowForLine, requestRowId } from "./request-timeline-selection";
export { RequestTimeline };
export type { RequestTimelineProps };
