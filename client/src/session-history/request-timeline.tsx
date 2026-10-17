import type {
	HistoryRegion,
	SessionHistoryAttemptCost,
	SessionHistoryCompaction,
	SessionHistoryCostReading,
	SessionHistoryRequestCost,
	SessionHistoryRequestEntry,
	SessionHistoryRequestSeries,
	SessionHistoryRequestUsage,
} from "#benchmark/session-history";
import type { SessionHistoryRequestCostEntry } from "#server/session-history-reader";
import type { TranscriptInstructionLoads } from "#benchmark/transcript-instruction-loads";
import { cn } from "#client/system/cn";
import { SequencePlot } from "#client/system/components/sequence-plot";
import { Metric } from "#client/system/components/metric";
import { PaneHeading } from "./pane-heading";
import { selectableRow } from "./selectable-row";

const tokens = new Intl.NumberFormat("en-US");
export const usd = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 2,
	maximumFractionDigits: 6,
});
const roundedUsd = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
});

export function requestRowId(entry: SessionHistoryRequestEntry): string {
	return `${entry.line}`;
}

/**
 * One rule, read in both directions: a request owns the transcript lines from
 * its own line until the next request's. Every pane selects through it, so they
 * cannot disagree about which request a line belongs to.
 */
export function requestRowForLine(
	entries: readonly SessionHistoryRequestEntry[],
	line: number | undefined,
): string | undefined {
	if (line === undefined) {
		return undefined;
	}
	let owner: SessionHistoryRequestEntry | undefined;
	for (const entry of entries) {
		if (entry.line <= line) {
			owner = entry;
		}
	}

	return owner === undefined ? undefined : requestRowId(owner);
}

/**
 * A compaction is recorded on its own transcript line, never on a request's,
 * so matching the two line numbers marks nothing. The request that owns the
 * line is the one that was in flight when the compaction happened.
 */
function compactingRequestIds(
	entries: readonly SessionHistoryRequestEntry[],
	compactions: readonly SessionHistoryCompaction[],
): ReadonlySet<string> {
	const owners = compactions.map((compaction) =>
		requestRowForLine(entries, compaction.line),
	);

	return new Set(owners.filter((id) => id !== undefined));
}

/**
 * Only attempt-region requests are priced, so an absent cost says which region
 * the row sits in rather than a pricing failure. Saying "outside the attempt
 * region" for every row of a boundary-unknown series would name a region that
 * series never established.
 */
function requestCostLabel(
	cost: SessionHistoryRequestCost | undefined,
	region: HistoryRegion,
): string {
	if (cost === undefined) {
		return `? Unpriced · ${region} requests are not priced`;
	}

	return cost.state === "priced"
		? usd.format(cost.costUsd)
		: `? Unpriced · ${cost.reason}`;
}

export function costHeadline(
	reading: SessionHistoryCostReading,
	difference: boolean,
	format: Intl.NumberFormat = usd,
): string {
	if (reading.state === "unavailable") {
		return "? Unavailable";
	}
	if (reading.state === "complete") {
		return `✓ Complete · ${format.format(reading.costUsd)}`;
	}
	if (difference) {
		return `◐ Incomplete · ${format.format(reading.costUsd)} difference`;
	}
	if (reading.pricedRequestCount === 0) {
		return `? Unpriced · 0 of ${reading.requestCount} requests priced`;
	}
	return `◐ Incomplete · ${format.format(reading.costUsd)} known subtotal over ${reading.pricedRequestCount} of ${reading.requestCount} requests`;
}

export function costLabel(reading: SessionHistoryCostReading): string {
	const headline = costHeadline(reading, false);
	return reading.state === "complete"
		? headline
		: `${headline} · ${reading.reasons.join(", ")}`;
}

function totalsLabel(series: SessionHistoryRequestSeries): string {
	const { attemptTotals } = series;
	if (attemptTotals.state === "unavailable") {
		return `? Unavailable · ${attemptTotals.reasons.join(", ")}`;
	}
	if (attemptTotals.state === "incomplete") {
		return `◐ Incomplete · ${tokens.format(attemptTotals.totalInputTokens)} total input tokens over ${attemptTotals.countedRequestCount} of ${attemptTotals.requestCount} requests · ${attemptTotals.reasons.join(", ")}`;
	}

	return `✓ Complete · ${tokens.format(attemptTotals.totalInputTokens)} total input tokens over ${attemptTotals.requestCount} attempt requests`;
}

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
	if (entry.usageState !== "complete" || widest === 0) {
		return undefined;
	}

	return `${(entry.totalInputTokens / widest) * 100}%`;
}

/**
 * Measured over every entry rather than the filtered rows, so filtering the
 * panes does not rescale the bars and make a narrowed view look different
 * from the same requests in the full one.
 */
function widestTotal(entries: readonly SessionHistoryRequestEntry[]): number {
	let widest = 0;
	for (const entry of entries) {
		if (entry.usageState === "complete") {
			widest = Math.max(widest, entry.totalInputTokens);
		}
	}

	return widest;
}

function totalLabel(entry: SessionHistoryRequestEntry): string {
	if (entry.usageState === "complete") {
		return tokens.format(entry.totalInputTokens);
	}

	return entry.usageState;
}

function categoryLabel(entry: SessionHistoryRequestEntry): string {
	if (entry.usageState === "conflict") {
		return "usage conflict";
	}

	if (entry.usageState === "incomplete") {
		return `at least ${categories(entry.lowerBound)}`;
	}

	return categories(entry.usage);
}

export function categories(usage: SessionHistoryRequestUsage): string {
	return [
		`in ${tokens.format(usage.inputTokens)}`,
		`out ${tokens.format(usage.outputTokens)}`,
		`read ${tokens.format(usage.cacheReadTokens)}`,
		`write ${tokens.format(usage.cacheWriteTokens)}`,
	].join(" · ");
}

function modelLabel(entry: SessionHistoryRequestEntry): string {
	if (entry.modelState === "conflict") {
		return "model conflict";
	}

	return entry.model ?? "? Unavailable model";
}

function InstructionLoads({
	loads,
}: {
	readonly loads: TranscriptInstructionLoads;
}): React.JSX.Element {
	if (loads.state === "unavailable") {
		return (
			<p className="px-3 py-2.5 text-14 text-attention">
				? Unavailable · the transcript carries no instructions attachment.
			</p>
		);
	}

	return (
		<ul className="flex flex-col gap-1.5 px-3 py-2.5">
			{loads.loads.map((load, index) => (
				<li
					key={`${index}:${load.memoryType}:${load.filePath}`}
					className="flex min-w-0 flex-col gap-0.5"
				>
					<code className="truncate font-mono text-12 text-accent-foreground">
						{load.filePath}
					</code>
					<small className="text-12 text-muted-foreground">
						{load.memoryType}
					</small>
					<small className="text-12 text-muted-foreground">
						reason, trigger and include parent unavailable in the transcript
					</small>
				</li>
			))}
			{loads.loads.length === 0 ? (
				<li>The attachment names no loaded file.</li>
			) : null}
		</ul>
	);
}

export function CostReading({
	reading,
	difference,
}: {
	readonly reading: SessionHistoryCostReading;
	readonly difference: boolean;
}): React.JSX.Element {
	const displayed = costHeadline(reading, difference, roundedUsd);
	const exact =
		reading.state === "unavailable"
			? undefined
			: reading.costUsd.toLocaleString("en-US", {
					style: "currency",
					currency: "USD",
					maximumFractionDigits: 20,
				});
	const rounded =
		reading.state === "unavailable"
			? undefined
			: roundedUsd.format(reading.costUsd);
	if (reading.state === "complete" && exact === rounded) {
		return <>{displayed}</>;
	}
	return (
		<>
			<span className={reading.state === "complete" ? "" : "text-attention"}>
				{displayed}
			</span>
			<details
				className={`mt-1 text-12 ${reading.state === "complete" ? "" : "text-attention"}`}
			>
				<summary className="cursor-pointer">
					{reading.state === "complete"
						? "Exact measurement"
						: `${reading.reasons.length} pricing gaps`}
					{reading.state === "incomplete"
						? ` · ${reading.pricedRequestCount}/${reading.requestCount} requests priced`
						: ""}
				</summary>
				{exact === rounded ? null : (
					<p className="mt-2 font-mono text-12">Exact amount: {exact}</p>
				)}
				<ul className="mt-2 flex flex-col gap-1 text-secondary-foreground">
					{(reading.state === "complete" ? [] : reading.reasons).map(
						(reason, index) => (
							<li key={`${index}:${reason}`}>{reason}</li>
						),
					)}
				</ul>
			</details>
		</>
	);
}

export function RequestCostReadings({
	cost,
}: {
	readonly cost: SessionHistoryAttemptCost;
}): React.JSX.Element {
	return (
		<dl
			aria-label="Session root attempt cost"
			className="grid gap-5 rounded-lg border border-divider bg-card p-4 md:grid-cols-3"
		>
			{[
				{
					term: "Provider reported · attempt",
					reading: cost.reported,
					difference: false,
				},
				{
					term: "Calculated · root requests",
					reading: cost.calculated,
					difference: false,
				},
				{
					term: "Remaining difference",
					reading: cost.difference,
					difference: true,
				},
			].map(({ term, reading, difference }) => (
				<Metric
					key={term}
					label={term}
					value={<CostReading reading={reading} difference={difference} />}
				/>
			))}
		</dl>
	);
}

function SelectedRequest({
	entry,
	cost,
}: {
	readonly entry: SessionHistoryRequestEntry | undefined;
	readonly cost: SessionHistoryRequestCost | undefined;
}): React.JSX.Element | null {
	if (entry === undefined) {
		return null;
	}
	return (
		<section
			aria-label="Selected request"
			className="border-b bg-muted px-3 py-3"
		>
			<h3 className="text-14 font-medium">
				{entry.requestId ?? `Request at line ${entry.line}`}
			</h3>
			<p className="mt-1 text-12 text-muted-foreground">
				Session root · {entry.region} · line {entry.line} · {modelLabel(entry)}
			</p>
			<div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
				<p className="font-mono text-14">
					{totalLabel(entry)}{" "}
					<span className="text-12 text-secondary-foreground">
						total input tokens
					</span>
				</p>
				<p className="font-mono text-14">
					{requestCostLabel(cost, entry.region)}
				</p>
			</div>
			<p className="mt-2 font-mono text-12 text-secondary-foreground">
				{categoryLabel(entry)}
			</p>
			<p className="mt-1 text-12 text-muted-foreground">
				Input = uncached + cache read + cache write. Output is separate. Cost is
				calculated from request usage and catalog rates; it is not a separately
				reported provider charge.
			</p>
		</section>
	);
}

export function RequestTimeline({
	series,
	entries,
	requestCosts,
	instructionLoads,
	selected,
	onSelect,
}: {
	readonly series: SessionHistoryRequestSeries;
	/** The rows to show, which the source filter narrows from series.entries. */
	readonly entries: readonly SessionHistoryRequestEntry[];
	readonly requestCosts: readonly SessionHistoryRequestCostEntry[];
	readonly instructionLoads: TranscriptInstructionLoads;
	readonly selected: string | undefined;
	readonly onSelect: (entry: SessionHistoryRequestEntry) => void;
}): React.JSX.Element {
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
			<div className="border-b px-4 py-4">
				<SequencePlot
					label="Request input growth"
					unit="input tokens"
					points={series.entries.map((entry, index) => ({
						id: requestRowId(entry),
						label: `Request ${index + 1} · line ${entry.line}`,
						value:
							entry.usageState === "complete"
								? entry.totalInputTokens
								: undefined,
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
						{entries.length} of {series.entries.length} requests match the
						source filter. The chart keeps the whole session scale; selecting a
						point outside the filter opens its scope.
					</p>
				)}
			</div>
			<SelectedRequest
				entry={active}
				cost={active === undefined ? undefined : costByLine.get(active.line)}
			/>
			<p className="px-3 py-2.5 text-12 text-muted-foreground">
				{series.name}. The provider's active context window is not measured:
				this number omits {series.omits.join(" and ")}.
			</p>
			<div
				className="grid max-h-80 overflow-auto border-t md:grid-cols-2"
				role="listbox"
				aria-label="Request timeline"
			>
				{entries.map((entry) => (
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
						<span className="flex justify-between gap-2.5">
							<code className="truncate font-mono text-12 text-accent-foreground">
								Request {series.entries.indexOf(entry) + 1} · line {entry.line}
							</code>
							<small className="text-12 text-muted-foreground">
								{entry.region}
							</small>
						</span>
						<small className="max-w-full truncate font-mono text-12 text-muted-foreground">
							{entry.requestId ?? "Request ID not recorded"}
						</small>
						{entry.usageState === "complete" && widest > 0 ? (
							<span
								className="block h-1 w-(--bar-width) bg-primary"
								style={{ "--bar-width": barWidth(entry, widest) }}
							/>
						) : null}
						<strong className="font-mono text-14">{totalLabel(entry)}</strong>
						<small className="text-12 text-muted-foreground">
							{categoryLabel(entry)}
						</small>
						<small className="text-12 text-muted-foreground">
							{modelLabel(entry)}
						</small>
						<small className="text-12 text-muted-foreground">
							{requestCostLabel(costByLine.get(entry.line), entry.region)}
						</small>
						{compacted.has(requestRowId(entry)) ? (
							<small className="text-12 text-accent-foreground">
								⇥ compaction after this request
							</small>
						) : null}
					</button>
				))}
				{entries.length === 0 ? (
					<p className="px-3 py-2.5 text-14 text-attention">
						This attempt's transcript records no request.
					</p>
				) : null}
			</div>
			<h3 className="px-3 pt-3">
				<span className="text-12 text-muted-foreground">
					Automatic instruction loads
				</span>
			</h3>
			<InstructionLoads loads={instructionLoads} />
		</section>
	);
}
