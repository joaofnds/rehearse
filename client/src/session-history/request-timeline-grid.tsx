import type {
	SessionHistoryRequestCost,
	SessionHistoryRequestEntry,
	SessionHistoryRequestSeries,
} from "#benchmark/session-history";
import cn from "#client/system/cn";
import type { SessionHistoryRequestCostEntry } from "#server/session-history-reader";

import { requestCostLabel } from "./request-cost-readings";
import {
	PERCENT_SCALE,
	categoryLabel,
	modelLabel,
	totalLabel,
} from "./request-input-readings";
import type { RequestTimelineProps } from "./request-timeline";
import { requestRowId } from "./request-timeline-selection";
import selectableRow from "./selectable-row";

const NO_INPUT_TOKENS = 0;

const REQUEST_NUMBER_BASE = 1;

const EMPTY_COLLECTION_LENGTH = 0;

/**
 * A row's share of the widest total in the series, so a fall between two
 * requests renders as a fall. Scaling each row against its own value, or
 * against a running maximum, would flatten every row to full width and hide
 * exactly the shape the timeline exists to show.
 */
function barWidth(
	entry: SessionHistoryRequestEntry,
	widest: number,
): string | undefined {
	if (entry.usageState !== "complete" || widest === NO_INPUT_TOKENS) {
		return undefined;
	}

	return `${(entry.totalInputTokens / widest) * PERCENT_SCALE}%`;
}

interface RequestTimelineEntryProps {
	readonly series: SessionHistoryRequestSeries;
	readonly entry: SessionHistoryRequestEntry;
	readonly selected: string | undefined;
	readonly onSelect: RequestTimelineProps["onSelect"];
	readonly widest: number;
	readonly costByLine: ReadonlyMap<
		SessionHistoryRequestCostEntry["line"],
		SessionHistoryRequestCostEntry["cost"]
	>;
	readonly compacted: ReadonlySet<string>;
}

function RequestTimelineEntry({
	series,
	entry,
	selected,
	onSelect,
	widest,
	costByLine,
	compacted,
}: RequestTimelineEntryProps): React.JSX.Element {
	return (
		<button
			type="button"
			role="option"
			key={requestRowId(entry)}
			aria-selected={requestRowId(entry) === selected}
			className={cn(
				selectableRow({ markedBy: "selected" }),
				"flex flex-col gap-1",
			)}
			onClick={() => {
				onSelect(entry);
			}}
		>
			<RequestIdentity series={series} entry={entry} />
			<small className="max-w-full truncate font-mono text-12 text-muted-foreground">
				{entry.requestId ?? "Request ID not recorded"}
			</small>
			{entry.usageState === "complete" && widest > NO_INPUT_TOKENS ? (
				<span
					className="block h-1 w-(--bar-width) bg-primary"
					style={{ "--bar-width": barWidth(entry, widest) }}
				/>
			) : null}
			<RequestMeasurementReadings
				entry={entry}
				cost={costByLine.get(entry.line)}
			/>
			{compacted.has(requestRowId(entry)) ? (
				<small className="text-12 text-accent-foreground">
					⇥ compaction after this request
				</small>
			) : null}
		</button>
	);
}

interface RequestIdentityProps {
	readonly series: SessionHistoryRequestSeries;
	readonly entry: SessionHistoryRequestEntry;
}

function RequestIdentity({
	series,
	entry,
}: RequestIdentityProps): React.JSX.Element {
	return (
		<span className="flex justify-between gap-2.5">
			<code className="truncate font-mono text-12 text-accent-foreground">
				Request {series.entries.indexOf(entry) + REQUEST_NUMBER_BASE} · line{" "}
				{entry.line}
			</code>
			<small className="text-12 text-muted-foreground">{entry.region}</small>
		</span>
	);
}

interface RequestTimelineGridProps {
	readonly series: SessionHistoryRequestSeries;
	readonly entries: readonly SessionHistoryRequestEntry[];
	readonly selected: string | undefined;
	readonly onSelect: RequestTimelineProps["onSelect"];
	readonly widest: number;
	readonly costByLine: ReadonlyMap<
		SessionHistoryRequestCostEntry["line"],
		SessionHistoryRequestCostEntry["cost"]
	>;
	readonly compacted: ReadonlySet<string>;
}

function RequestTimelineGrid({
	series,
	entries,
	selected,
	onSelect,
	widest,
	costByLine,
	compacted,
}: RequestTimelineGridProps): React.JSX.Element {
	return (
		<div
			className="grid max-h-80 overflow-auto border-t md:grid-cols-2"
			role="listbox"
			aria-label="Request timeline"
		>
			{entries.map((entry) => (
				<RequestTimelineEntry
					key={requestRowId(entry)}
					series={series}
					entry={entry}
					selected={selected}
					onSelect={onSelect}
					widest={widest}
					costByLine={costByLine}
					compacted={compacted}
				/>
			))}
			{entries.length === EMPTY_COLLECTION_LENGTH ? (
				<p className="px-3 py-2.5 text-14 text-attention">
					This attempt's transcript records no request.
				</p>
			) : null}
		</div>
	);
}

interface RequestMeasurementReadingsProps {
	readonly entry: SessionHistoryRequestEntry;
	readonly cost: SessionHistoryRequestCost | undefined;
}

function RequestMeasurementReadings({
	entry,
	cost,
}: RequestMeasurementReadingsProps): React.JSX.Element {
	return (
		<>
			<strong className="font-mono text-14">{totalLabel(entry)}</strong>
			<small className="text-12 text-muted-foreground">
				{categoryLabel(entry)}
			</small>
			<small className="text-12 text-muted-foreground">
				{modelLabel(entry)}
			</small>
			<small className="text-12 text-muted-foreground">
				{requestCostLabel(cost, entry.region)}
			</small>
		</>
	);
}

export { RequestTimelineGrid as default };
