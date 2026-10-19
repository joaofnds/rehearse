import type {
	SessionHistoryRequestEntry,
	SessionHistoryRequestSeries,
} from "#benchmark/session-history";
import Metric from "#client/system/components/metric";
import { SequencePlot } from "#client/system/components/sequence-plot";

import { tokens, totalsLabel } from "./request-input-readings";
import type { RequestTimelineProps } from "./request-timeline";
import { requestRowId } from "./request-timeline-selection";

const ORDINAL_BASE = 1;

interface RequestInputChartProps {
	readonly series: SessionHistoryRequestSeries;
	readonly selected: string | undefined;
	readonly onSelect: RequestTimelineProps["onSelect"];
}

function RequestInputChart({
	series,
	selected,
	onSelect,
}: RequestInputChartProps): React.JSX.Element {
	return (
		<SequencePlot
			label="Request input growth"
			unit="input tokens"
			points={series.entries.map((entry, index) => ({
				id: requestRowId(entry),
				label: `Request ${index + ORDINAL_BASE} · line ${entry.line}`,
				value:
					entry.usageState === "complete" ? entry.totalInputTokens : undefined,
			}))}
			selected={selected}
			formatValue={(value) => tokens.format(Math.round(value))}
			onSelect={(id) => {
				const entry = series.entries.find(
					(point) => requestRowId(point) === id,
				);
				if (entry !== undefined) {
					onSelect(entry);
				}
			}}
		/>
	);
}

interface RequestInputSummaryProps {
	readonly series: SessionHistoryRequestSeries;
	readonly entries: readonly SessionHistoryRequestEntry[];
	readonly selected: string | undefined;
	readonly onSelect: RequestTimelineProps["onSelect"];
	readonly widest: number;
}

function RequestInputSummary({
	series,
	entries,
	selected,
	onSelect,
	widest,
}: RequestInputSummaryProps): React.JSX.Element {
	return (
		<div className="border-b px-4 py-4">
			<RequestInputChart
				series={series}
				selected={selected}
				onSelect={onSelect}
			/>
			<dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
				<Metric
					label="Peak measured input"
					value={
						series.entries.some((entry) => entry.usageState === "complete")
							? `${tokens.format(widest)} tokens`
							: "Unavailable"
					}
					hint="Largest individual request, not summed across agents"
				/>
				<Metric label="Attempt totals" value={totalsLabel(series)} />
			</dl>
			{entries.length === series.entries.length ? null : (
				<p className="mt-3 text-12 text-muted-foreground">
					{entries.length} of {series.entries.length} requests match the source
					filter. The chart keeps the whole session scale; selecting a point
					outside the filter opens its scope.
				</p>
			)}
		</div>
	);
}

export { RequestInputSummary as default };
