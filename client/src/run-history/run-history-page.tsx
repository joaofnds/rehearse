import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Disclosure } from "#client/system/components/disclosure";
import { EmptyState } from "#client/system/components/empty-state";
import { FilterPill } from "#client/system/components/filter-pill";
import type { GradeValue } from "#client/system/components/grade";
import { Grade } from "#client/system/components/grade";
import { Status } from "#client/system/components/status";
import { TableShell } from "#client/system/components/table-shell";
import { Button } from "#client/system/ui/button";
import { elapsedReading, liveElapsedMs, spendReading } from "./run-progress";
import type { RunHistoryResponse } from "./run-history-query";
import { runHistoryQuery } from "./run-history-query";
import { isStopped, runStatusState, stoppedStage } from "./run-status";
import { plural } from "#client/plural";
import { ScreenHeader } from "#client/system/components/screen-header";
import { SectionLabel } from "#client/system/components/section-label";
import { Notice } from "#client/system/components/notice";

type RunHistoryRow = RunHistoryResponse["rows"][number];
type UnreadableRun = RunHistoryResponse["unreadable"][number];

const COLUMNS = [
	"Run",
	"Case",
	"Outcome",
	"Progress",
	"Grade",
	"Corpus",
] as const;

/**
 * How often the list re-reads itself while a run is in flight. The operator is
 * watching readings move, so the interval has to be shorter than the attention
 * span of someone staring at a screen; the route's cost is a directory scan
 * and one liveness probe per candidate run, against a run count that is
 * realistically one. Polling stops when no run is running, so a page left open
 * on finished history costs nothing.
 */
const RUNNING_POLL_MS = 2000;

/**
 * How often the elapsed readings redraw between the run's own measurements. A
 * run records its elapsed time when it emits an event, once per agent turn and
 * minutes apart, so without this the clock would stop between turns. One
 * second is the unit the reading shows in its first minute.
 */
const ELAPSED_TICK_MS = 1000;

/**
 * The clock the elapsed readings are drawn against, advancing on its own so a
 * run's reading keeps moving between the sparse events the run itself records.
 * It ticks only while something is running, so a page showing finished history
 * redraws nothing.
 */
function useNow(running: boolean): number {
	const [nowMs, setNowMs] = useState(() => Date.now());

	useEffect(() => {
		if (!running) {
			return undefined;
		}

		const timer = setInterval(() => {
			setNowMs(Date.now());
		}, ELAPSED_TICK_MS);

		return () => {
			clearInterval(timer);
		};
	}, [running]);

	return nowMs;
}

const FILTERS = ["All", "Stopped"] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(row: RunHistoryRow, filter: Filter): boolean {
	return filter === "All" || isStopped(row.status);
}

function UnreadableRuns({
	runs,
}: {
	readonly runs: readonly UnreadableRun[];
}): React.JSX.Element {
	return (
		<Notice
			message="These runs could not be read, so they are missing from the table below:"
			items={runs.map((run) => `${run.id} — ${run.reason}`)}
		/>
	);
}

function statusLine(row: RunHistoryRow): React.JSX.Element {
	if (!isStopped(row.status)) {
		return <span className="font-mono text-xs text-dim">{row.status}</span>;
	}

	return (
		<a
			href={`/runs/${encodeURIComponent(row.run)}/stages/${encodeURIComponent(stoppedStage(row.status))}`}
			className="inline-flex min-h-14 items-center self-start font-mono text-xs text-accent-foreground underline decoration-deeper underline-offset-4 hover:text-pale"
		>
			{row.status}
		</a>
	);
}

function outcomeCell(row: RunHistoryRow): React.JSX.Element {
	return (
		<span className="flex flex-col gap-0.5">
			<Status state={runStatusState(row.status)} />
			{statusLine(row)}
		</span>
	);
}

/**
 * What a run in flight is doing, blank for a run that has finished. The spend
 * carries the words the server sends for what it covers, because the figure
 * is not the run's total: each event kind scopes it differently, and one
 * scoped to a single stage falls when the next stage starts.
 */
function progressCell(row: RunHistoryRow, nowMs: number): React.JSX.Element {
	if (row.progress.state === "recorded") {
		return <span />;
	}

	const { stage, elapsedMs, measuredAt, spentUsd, spendScope } = row.progress;

	return (
		<span className="flex flex-col gap-0.5">
			<span>{stage}</span>
			<span className="flex gap-2.5 font-mono text-sm">
				<span>
					{elapsedReading(liveElapsedMs(elapsedMs, measuredAt, nowMs))}
				</span>
				<span>{spendReading(spentUsd)}</span>
			</span>
			<span className="text-xs text-dim">{spendScope}</span>
		</span>
	);
}

function causeList(
	staleCauses: readonly string[],
): readonly React.JSX.Element[] {
	return staleCauses.map((cause, index) => (
		<span key={index} className="text-xs text-dim">
			{cause}
		</span>
	));
}

/**
 * TableShell keys its rows by index, so filtering the table hands a row's
 * cells to whatever Disclosure the previous row left mounted there, with its
 * open state intact. Keying by the run makes React remount it instead.
 */
function causesFor(row: RunHistoryRow): React.ReactNode {
	if (row.staleCauses.length <= 1) {
		return causeList(row.staleCauses);
	}

	return (
		<Disclosure
			key={row.run}
			collapsedLabel={`${row.staleCauses.length} causes`}
			expandedLabel="hide causes"
		>
			{causeList(row.staleCauses)}
		</Disclosure>
	);
}

function corpusCell(row: RunHistoryRow): React.JSX.Element {
	if (row.corpus === undefined && !row.stale) {
		return <span className="text-faint">—</span>;
	}

	return (
		<span className="flex flex-col items-start gap-0.5">
			{row.corpus === undefined ? null : (
				<span className="font-mono text-sm text-secondary-foreground">{`corpus@${row.corpus.digest}`}</span>
			)}
			{row.stale ? (
				<span className="text-xs text-secondary-foreground">
					<Status state="stale" />
				</span>
			) : (
				<span className="text-xs text-muted-foreground">
					<Status state="clear" />
				</span>
			)}
			{causesFor(row)}
		</span>
	);
}

function gradeCell(row: RunHistoryRow): React.JSX.Element {
	const value: GradeValue =
		row.grade === undefined ? { pending: true } : { letter: row.grade };

	return <Grade value={value} size="inline" />;
}

function filterLabel(filter: Filter, total: number | undefined): string {
	return filter === "All" && total !== undefined ? `All ${total}` : filter;
}

function FilterBar({
	active,
	total,
	onSelect,
}: {
	readonly active: Filter;
	readonly total: number | undefined;
	readonly onSelect: (filter: Filter) => void;
}): React.JSX.Element {
	return (
		<div className="flex flex-wrap items-center gap-2 border-b border-divider px-6 py-2.5">
			<span className="mr-0.5">
				<SectionLabel>Filter</SectionLabel>
			</span>
			{FILTERS.map((filter) => (
				<FilterPill
					key={filter}
					pressed={filter === active}
					onPress={() => {
						onSelect(filter);
					}}
				>
					{filterLabel(filter, total)}
				</FilterPill>
			))}
		</div>
	);
}

export function RunHistoryPage(): React.JSX.Element {
	const [filter, setFilter] = useState<Filter>("All");
	const query = useQuery({
		...runHistoryQuery,
		refetchInterval: ({ state }) =>
			(state.data?.rows ?? []).some((row) => row.progress.state === "running")
				? RUNNING_POLL_MS
				: false,
	});

	const unreadable = query.data?.unreadable ?? [];
	const recorded = query.data?.rows ?? [];
	const rows = recorded.filter((row) => matchesFilter(row, filter));
	const onlyUnreadableRuns = recorded.length === 0 && unreadable.length > 0;
	const nowMs = useNow(
		recorded.some((row) => row.progress.state === "running"),
	);

	return (
		<div>
			<ScreenHeader
				title="Run history"
				subline={
					query.isSuccess
						? `${plural(recorded.length, "record")} on disk · every row names the corpus version that produced it`
						: undefined
				}
			/>

			<FilterBar
				active={filter}
				total={query.isSuccess ? recorded.length : undefined}
				onSelect={setFilter}
			/>

			<div className="flex flex-col gap-4 px-6 pt-3 pb-12">
				{query.isLoading ? (
					<p className="text-muted-foreground">Loading…</p>
				) : null}
				{query.isError ? (
					<p role="alert" className="text-muted-foreground">
						<span aria-hidden="true">⚠ </span>
						Could not load run history.
					</p>
				) : null}

				{unreadable.length > 0 ? <UnreadableRuns runs={unreadable} /> : null}

				{query.isSuccess && rows.length === 0 && !onlyUnreadableRuns ? (
					<EmptyState heading="No runs recorded">
						<p>
							The corpus is linked and a spend limit is set. Declare a case,
							then run it. Every attempt lands here as a durable record.
						</p>
						<Button disabled>Declare a case</Button>
					</EmptyState>
				) : null}

				{rows.length > 0 ? (
					<>
						<TableShell
							caption="DURABLE RECORDS"
							columns={[...COLUMNS]}
							rows={rows.map((row) => [
								<span key="run" className="font-mono text-sm">
									{row.run}
								</span>,
								<span key="case" className="font-mono text-sm">
									{row.caseId}
								</span>,
								outcomeCell(row),
								progressCell(row, nowMs),
								gradeCell(row),
								corpusCell(row),
							])}
						/>
						<p className="max-w-prose text-sm text-dim">
							A stopped run is a recorded outcome, not an error: the step that
							fell below the minimum is the finding. Runs marked stale were
							produced by a corpus version that has since changed, and their
							grades are kept as history.
						</p>
					</>
				) : null}
			</div>
		</div>
	);
}
