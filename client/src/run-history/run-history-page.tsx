import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";
import { CorpusPill } from "#client/system/components/corpus-pill";
import { Disclosure } from "#client/system/components/disclosure";
import { EmptyState } from "#client/system/components/empty-state";
import { FilterPill } from "#client/system/components/filter-pill";
import type { GradeValue } from "#client/system/components/grade";
import { Grade } from "#client/system/components/grade";
import { Status } from "#client/system/components/status";
import { TableShell } from "#client/system/components/table-shell";
import { elapsedReading, liveElapsedMs, spendReading } from "./run-progress";
import { runStatusState } from "./run-status";
import "./run-history-page.css";

/**
 * The row shape comes from the server's own route type via Hono's RPC
 * client, `apiClient.api.runs.$get`, rather than a hand-declared schema
 * repeating what `src/server/run-history.ts`'s `RunHistoryRow` already
 * states (decision-3's stated reason for choosing Hono).
 */
type RunHistoryResponse = InferResponseType<typeof apiClient.api.runs.$get>;
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
	return filter === "All" || row.status.startsWith("STOPPED:");
}

async function fetchRunHistoryReport(): Promise<RunHistoryResponse> {
	const response = await apiClient.api.runs.$get();

	return response.json();
}

function UnreadableRuns({
	runs,
}: {
	readonly runs: readonly UnreadableRun[];
}): React.JSX.Element {
	return (
		<div className="rh-run-history__unreadable" role="alert">
			<p>
				These runs could not be read, so they are missing from the table below:
			</p>
			<ul>
				{runs.map((run) => (
					<li key={run.id}>{`${run.id} — ${run.reason}`}</li>
				))}
			</ul>
		</div>
	);
}

function outcomeCell(row: RunHistoryRow): React.JSX.Element {
	return (
		<span className="rh-run-history__outcome">
			<Status state={runStatusState(row.status)} />
			<span className="rh-run-history__outcome-detail">{row.status}</span>
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
		<span className="rh-run-history__progress">
			<span className="rh-run-history__progress-stage">{stage}</span>
			<span className="rh-run-history__progress-readings">
				<span>
					{elapsedReading(liveElapsedMs(elapsedMs, measuredAt, nowMs))}
				</span>
				<span>{spendReading(spentUsd)}</span>
			</span>
			<span className="rh-run-history__progress-scope">{spendScope}</span>
		</span>
	);
}

function causeList(
	staleCauses: readonly string[],
): readonly React.JSX.Element[] {
	return staleCauses.map((cause, index) => (
		<span key={index} className="rh-run-history__cause">
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
		return <span className="rh-run-history__no-corpus">—</span>;
	}

	return (
		<span className="rh-run-history__corpus">
			{row.corpus === undefined ? null : (
				<CorpusPill hash={row.corpus.digest} />
			)}
			<Status state={row.stale ? "stale" : "clear"} />
			{causesFor(row)}
		</span>
	);
}

function gradeCell(row: RunHistoryRow): React.JSX.Element {
	const value: GradeValue =
		row.grade === undefined ? { pending: true } : { letter: row.grade };

	return <Grade value={value} size="13" />;
}

function FilterBar({
	active,
	onSelect,
}: {
	readonly active: Filter;
	readonly onSelect: (filter: Filter) => void;
}): React.JSX.Element {
	return (
		<div className="rh-run-history__filters">
			{FILTERS.map((filter) => (
				<FilterPill
					key={filter}
					pressed={filter === active}
					onPress={() => {
						onSelect(filter);
					}}
				>
					{filter}
				</FilterPill>
			))}
		</div>
	);
}

export function RunHistoryPage(): React.JSX.Element {
	const [filter, setFilter] = useState<Filter>("All");
	const query = useQuery({
		queryKey: ["run-history"],
		queryFn: fetchRunHistoryReport,
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
		<div className="rh-run-history">
			<h1>Run history</h1>
			<FilterBar active={filter} onSelect={setFilter} />

			{query.isLoading ? <p>Loading…</p> : null}
			{query.isError ? <p role="alert">Could not load run history.</p> : null}

			{unreadable.length > 0 ? <UnreadableRuns runs={unreadable} /> : null}

			{query.isSuccess && rows.length === 0 && !onlyUnreadableRuns ? (
				<EmptyState heading="No runs recorded">
					<p>
						The corpus is linked and a spend limit is set. Declare a case, then
						run it. Every attempt lands here as a durable record.
					</p>
					<button type="button" disabled>
						Declare a case
					</button>
				</EmptyState>
			) : null}

			{rows.length > 0 ? (
				<TableShell
					caption="DURABLE RECORDS"
					columns={[...COLUMNS]}
					rows={rows.map((row) => [
						row.run,
						row.caseId,
						outcomeCell(row),
						progressCell(row, nowMs),
						gradeCell(row),
						corpusCell(row),
					])}
				/>
			) : null}
		</div>
	);
}
