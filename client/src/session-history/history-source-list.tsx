import type { SessionHistorySource } from "#benchmark/session-history";
import plural from "#client/plural";
import cn from "#client/system/cn";

import type { SourceSort } from "./history-investigation-contract";
import {
	measurementLabel,
	sortedSources,
	sourceSizeLabel,
} from "./history-source-measurements";
import selectableRow from "./selectable-row";

const EMPTY_COLLECTION_LENGTH = 0;

const NO_SOURCE_ENTRIES = 0;

const NO_SOURCE_OCCURRENCES = 0;

interface SourceListProps {
	readonly sources: readonly SessionHistorySource[];
	readonly total: number;
	readonly query: string;
	readonly selected: string | undefined;
	readonly sort: SourceSort;
	readonly onSelect: (source?: SessionHistorySource) => void;
}

function SourceList({
	sources,
	total,
	query,
	selected,
	sort,
	onSelect,
}: SourceListProps): React.JSX.Element {
	return (
		<nav aria-label="Loaded sources">
			{query.trim() !== "" && selected !== undefined ? (
				<p className="px-3 py-2 text-12 text-muted-foreground">
					Search filters this source list. Evidence stays on the selected
					source.
				</p>
			) : null}
			<button
				type="button"
				className={cn(
					selectableRow({ markedBy: "pressed" }),
					"flex flex-col gap-1",
				)}
				aria-pressed={selected === undefined}
				onClick={() => {
					onSelect();
				}}
			>
				<span className="flex items-baseline justify-between gap-2.5">
					<span>All sources</span>
					<span className="font-mono text-accent-foreground">{total}</span>
				</span>
			</button>
			{sortedSources(sources, sort).map((source) => (
				<SourceRow
					key={source.id}
					source={source}
					selected={selected}
					onSelect={onSelect}
				/>
			))}
			{sources.length === EMPTY_COLLECTION_LENGTH ? (
				<p className="px-3 py-3 text-14 text-muted-foreground">
					{total === NO_SOURCE_ENTRIES
						? "No sources are available in this saved evidence."
						: "No sources match this search."}
				</p>
			) : null}
		</nav>
	);
}

interface SourceRowProps {
	readonly source: SessionHistorySource;
	readonly selected: string | undefined;
	readonly onSelect: SourceListProps["onSelect"];
}

function SourceRow({
	source,
	selected,
	onSelect,
}: SourceRowProps): React.JSX.Element {
	return (
		<button
			type="button"
			key={source.id}
			className={cn(
				selectableRow({ markedBy: "pressed" }),
				"flex flex-col gap-1",
			)}
			aria-pressed={selected === source.id}
			onClick={() => {
				onSelect(source);
			}}
		>
			<SourceLabel source={source} />
			<span
				className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-12 text-secondary-foreground"
				title={measurementLabel(source.measurement)}
			>
				<span>{sourceSizeLabel(source.measurement)}</span>
				<span>
					{source.observedDeliveryCount === undefined
						? "Deliveries unknown"
						: plural(
								source.observedDeliveryCount,
								"delivery",
								"deliveries",
							)}{" "}
					·{" "}
					{source.repeatDeliveryCount === undefined
						? "Repeats unknown"
						: plural(source.repeatDeliveryCount, "repeat")}
				</span>
			</span>
			{source.failedOccurrences +
				source.partialOccurrences +
				source.missingOccurrences +
				source.unavailableOccurrences ===
			NO_SOURCE_OCCURRENCES ? null : (
				<SourceOccurrenceFailures source={source} />
			)}
		</button>
	);
}

interface SourceOccurrenceFailuresProps {
	readonly source: SessionHistorySource;
}

function SourceOccurrenceFailures({
	source,
}: SourceOccurrenceFailuresProps): React.JSX.Element {
	return (
		<span className="text-12 text-attention">
			{[
				source.failedOccurrences === NO_SOURCE_OCCURRENCES
					? undefined
					: `${source.failedOccurrences} failed`,
				source.partialOccurrences === NO_SOURCE_OCCURRENCES
					? undefined
					: `${source.partialOccurrences} partial`,
				source.missingOccurrences === NO_SOURCE_OCCURRENCES
					? undefined
					: `${source.missingOccurrences} missing`,
				source.unavailableOccurrences === NO_SOURCE_OCCURRENCES
					? undefined
					: `${source.unavailableOccurrences} unavailable`,
			]
				.filter((value) => value !== undefined)
				.join(" · ")}
		</span>
	);
}

interface SourceLabelProps {
	readonly source: SessionHistorySource;
}

function SourceLabel({ source }: SourceLabelProps): React.JSX.Element {
	return (
		<span className="flex items-baseline justify-between gap-2.5">
			<strong className="min-w-0 font-medium break-words">{source.name}</strong>
			<span className="shrink-0 text-12 text-muted-foreground">
				{source.kind}
			</span>
		</span>
	);
}

export { measurementLabel } from "./history-source-measurements";
export { SourceList as default };
