import { useId, useState } from "react";

import FilterPill from "#client/system/components/filter-pill";
import { Button } from "#client/system/ui/button";

import SearchAndSort from "./history-search-and-sort";
import { NO_ACTIVE_FILTERS } from "./history-table-contract";
import type { RunDiscoverySearch } from "./run-discovery";

const STATUS_FILTERS = [
	["all", "All"],
	["running", "Running"],
	["ended", "Ended"],
	["passed", "Passed"],
	["failed", "Failed"],
	["stopped", "Stopped"],
] as const;

const KIND_FILTERS = [
	["all", "All kinds"],
	["run", "Tasks"],
	["session-attempt", "Sessions"],
	["replay", "Replays"],
	["group", "Groups"],
] as const;

const CORPUS_FILTERS = [
	["all", "All corpora"],
	["current", "Current corpus"],
	["stale", "Stale corpus"],
] as const;

interface FilterBarProps {
	readonly discovery: RunDiscoverySearch;
	readonly total: number | undefined;
	readonly onChange: (search: RunDiscoverySearch) => void;
	readonly invalidated: boolean;
	readonly onClear: () => void;
}

function FilterBar({
	discovery,
	total,
	onChange,
	invalidated,
	onClear,
}: FilterBarProps): React.JSX.Element {
	const [filtersOpen, setFiltersOpen] = useState(false);
	const filtersId = useId();
	const activeFilters =
		[discovery.status, discovery.kind, discovery.corpus].filter(
			(value) => value !== undefined && value !== "all",
		).length + Number(invalidated);

	return (
		<div className="flex flex-col gap-4 border-b border-divider page-gutter py-5">
			<SearchAndSort
				discovery={discovery}
				onChange={onChange}
				onClear={onClear}
			/>
			{discovery.sort === "cost" ? (
				<p className="text-12 text-muted-foreground">
					Cost sorting uses complete reported amounts; partial and missing costs
					come last.
				</p>
			) : null}
			<FilterToggle
				filtersOpen={filtersOpen}
				filtersId={filtersId}
				setFiltersOpen={setFiltersOpen}
				activeFilters={activeFilters}
			/>
			<ExpandedFilters
				discovery={discovery}
				total={total}
				onChange={onChange}
				invalidated={invalidated}
				onClear={onClear}
				filtersId={filtersId}
				filtersOpen={filtersOpen}
			/>
		</div>
	);
}

interface StatusFiltersProps {
	readonly discovery: RunDiscoverySearch;
	readonly total: number | undefined;
	readonly onChange: (search: RunDiscoverySearch) => void;
	readonly invalidated: boolean;
	readonly onClear: () => void;
}

function StatusFilters({
	discovery,
	total,
	onChange,
	invalidated,
	onClear,
}: StatusFiltersProps): React.JSX.Element {
	return (
		<div
			role="group"
			aria-label="Status"
			className="flex flex-wrap items-center gap-1.5"
		>
			<span className="w-15 text-12 text-dim">Status</span>
			{STATUS_FILTERS.map(([value, label]) => (
				<FilterPill
					key={value}
					pressed={(discovery.status ?? "all") === value && !invalidated}
					onPress={() => {
						onChange({ status: value });
					}}
				>
					{value === "all" && total !== undefined ? `All ${total}` : label}
				</FilterPill>
			))}
			{invalidated ? (
				<FilterPill pressed onPress={onClear}>
					Invalidated by the last edit
				</FilterPill>
			) : null}
		</div>
	);
}

interface KindAndCorpusFiltersProps {
	readonly discovery: RunDiscoverySearch;
	readonly onChange: (search: RunDiscoverySearch) => void;
}

function KindAndCorpusFilters({
	discovery,
	onChange,
}: KindAndCorpusFiltersProps): React.JSX.Element {
	return (
		<div className="flex flex-wrap items-center gap-x-6 gap-y-2">
			<div
				role="group"
				aria-label="Kind"
				className="flex flex-wrap items-center gap-1.5"
			>
				<span className="w-15 text-12 text-dim">Kind</span>
				{KIND_FILTERS.map(([value, label]) => (
					<FilterPill
						key={value}
						pressed={(discovery.kind ?? "all") === value}
						onPress={() => {
							onChange({ kind: value });
						}}
					>
						{label}
					</FilterPill>
				))}
			</div>
			<div
				role="group"
				aria-label="Corpus"
				className="flex flex-wrap items-center gap-1.5"
			>
				<span className="text-12 text-dim">Corpus</span>
				{CORPUS_FILTERS.map(([value, label]) => (
					<FilterPill
						key={value}
						pressed={(discovery.corpus ?? "all") === value}
						onPress={() => {
							onChange({ corpus: value });
						}}
					>
						{label}
					</FilterPill>
				))}
			</div>
		</div>
	);
}

interface ExpandedFiltersProps {
	readonly discovery: RunDiscoverySearch;
	readonly total: number | undefined;
	readonly onChange: (search: RunDiscoverySearch) => void;
	readonly invalidated: boolean;
	readonly onClear: () => void;
	readonly filtersId: string;
	readonly filtersOpen: boolean;
}

function ExpandedFilters({
	discovery,
	total,
	onChange,
	invalidated,
	onClear,
	filtersId,
	filtersOpen,
}: ExpandedFiltersProps): React.JSX.Element {
	return (
		<div
			id={filtersId}
			className={`${filtersOpen ? "flex" : "hidden"} flex-col gap-4 sm:flex`}
		>
			<StatusFilters
				discovery={discovery}
				total={total}
				onChange={onChange}
				invalidated={invalidated}
				onClear={onClear}
			/>
			<KindAndCorpusFilters discovery={discovery} onChange={onChange} />
		</div>
	);
}

interface FilterToggleProps {
	readonly filtersOpen: boolean;
	readonly filtersId: string;
	readonly setFiltersOpen: (open: boolean) => void;
	readonly activeFilters: number;
}

function FilterToggle({
	filtersOpen,
	filtersId,
	setFiltersOpen,
	activeFilters,
}: FilterToggleProps): React.JSX.Element {
	return (
		<div className="grid sm:hidden">
			<Button
				variant="outline"
				aria-expanded={filtersOpen}
				aria-controls={filtersId}
				onClick={() => {
					setFiltersOpen(!filtersOpen);
				}}
			>
				{filtersOpen ? "Hide filters" : "Filters"}
				{activeFilters === NO_ACTIVE_FILTERS
					? ""
					: ` · ${activeFilters} active`}
			</Button>
		</div>
	);
}

export { FilterBar as default };
