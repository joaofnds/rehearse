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
import { runStatusState } from "./run-status";
import {
	corpusMeasurementReading,
	corpusVersionLabel,
} from "#benchmark/corpus-version-label";
import { isStopped, stoppedStageOf } from "#benchmark/stopped-status";
import { attemptLabel } from "#client/attempt-label";
import { plural } from "#client/plural";
import { ScreenHeader } from "#client/system/components/screen-header";
import { SectionLabel } from "#client/system/components/section-label";
import { Notice } from "#client/system/components/notice";

type HistoryRow = RunHistoryResponse["rows"][number];
type RunHistoryRow = Extract<HistoryRow, { readonly kind: "run" }>;
type ContextLink = HistoryRow["links"][number];

function pipelineRuns(rows: readonly HistoryRow[]): readonly RunHistoryRow[] {
	return rows.filter((row): row is RunHistoryRow => row.kind === "run");
}
type UnreadableRecord = RunHistoryResponse["unreadable"][number];

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
 * span of someone staring at a screen; the route's cost is reading every saved
 * record under the runs directory, one liveness probe per candidate run, and
 * judging every record's staleness against the corpus under test, about a third
 * of a second for a hundred records. Polling stops when no run is running, so a
 * page left open on finished history costs nothing.
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

/**
 * Stopped names a pipeline run whose stage fell below the minimum. A replay's
 * STOP verdict grades one stage in isolation and stops nothing, so it does not
 * match.
 */
function matchesFilter(row: HistoryRow, filter: Filter): boolean {
	return filter === "All" || (row.kind === "run" && isStopped(row.status));
}

const UNREADABLE_NOUNS = {
	run: "run",
	"session-attempt": "session attempt",
	replay: "replay",
	group: "confirmation run",
	"short-ids": "short id registry",
} as const satisfies Readonly<Record<UnreadableRecord["kind"], string>>;

function unreadableSummary(
	records: readonly UnreadableRecord[],
): readonly string[] {
	return Object.entries(UNREADABLE_NOUNS).flatMap(([kind, noun]) => {
		const count = records.filter((record) => record.kind === kind).length;

		return count === 0 ? [] : [plural(count, noun)];
	});
}

function UnreadableRecords({
	records,
}: {
	readonly records: readonly UnreadableRecord[];
}): React.JSX.Element {
	return (
		<Notice
			message="These records could not be read, so they are missing from the table below:"
			items={unreadableSummary(records)}
		>
			<Disclosure
				collapsedLabel={`show ${records.length}`}
				expandedLabel="hide"
			>
				<ul className="flex flex-col gap-1 font-mono text-sm">
					{records.map(({ id, reason }) => (
						<li key={id}>{`${id}: ${reason}`}</li>
					))}
				</ul>
			</Disclosure>
		</Notice>
	);
}

/**
 * The name a record is filed under, the last part of its CLI record id. It
 * stays plain text: the links in the case cell say which page each
 * opens, where a linked name would leave that to guesswork.
 */
function identityOf(row: HistoryRow): string {
	switch (row.kind) {
		case "run": {
			return row.run;
		}
		case "session-attempt": {
			return row.uuid;
		}
		case "replay": {
			return row.timestamp;
		}
		case "group": {
			return row.groupId;
		}
		default: {
			return row satisfies never;
		}
	}
}

/**
 * What kind of record the row is, and where its record holds no time, that
 * the newest-first order could not place it.
 */
function kindLine(row: HistoryRow): string {
	switch (row.kind) {
		case "run": {
			return "pipeline run";
		}
		case "session-attempt": {
			return "session attempt · time not recorded";
		}
		case "replay": {
			return [
				"replay",
				row.stage,
				row.checkpointShortId === undefined
					? undefined
					: `from ${row.checkpointShortId}`,
				row.attempt === undefined ? undefined : attemptLabel(row.attempt),
			]
				.filter((part) => part !== undefined)
				.join(" · ");
		}
		case "group": {
			return `confirmation run · ${row.mode} · ${plural(row.reps, "rep")} · time not recorded`;
		}
		default: {
			return row satisfies never;
		}
	}
}

/** The record's short id, with the identity it is filed under beneath. */
function runCell(row: HistoryRow): React.JSX.Element {
	if (row.shortId === undefined) {
		return <span className="font-mono text-sm">{identityOf(row)}</span>;
	}

	return (
		<span className="flex flex-col gap-0.5">
			<span className="font-mono text-sm">{row.shortId}</span>
			<span className="font-mono text-xs text-dim">{identityOf(row)}</span>
		</span>
	);
}

const LINK_CLASS =
	"inline-flex min-h-14 items-center text-xs text-accent-foreground underline decoration-deeper underline-offset-4 hover:text-pale";

function contextLink(link: ContextLink): React.JSX.Element {
	switch (link.state) {
		case "available": {
			return (
				<a key={link.label} href={link.href} className={LINK_CLASS}>
					{link.label}
				</a>
			);
		}
		case "unavailable": {
			return (
				<span key={link.label} className="text-xs text-dim">
					{`${link.label} · ${link.reason}`}
				</span>
			);
		}
		default: {
			return link satisfies never;
		}
	}
}

function caseCell(row: HistoryRow): React.JSX.Element {
	return (
		<span className="flex flex-col items-start gap-0.5">
			{row.caseId === undefined ? (
				<span className="text-sm text-dim">case not recorded</span>
			) : (
				<span className="font-mono text-sm">{row.caseId}</span>
			)}
			<span className="text-xs text-dim">{kindLine(row)}</span>
			{row.links.length > 0 ? (
				<span className="flex flex-wrap gap-x-3">
					{row.links.map(contextLink)}
				</span>
			) : null}
		</span>
	);
}

function statusLine(row: RunHistoryRow): React.JSX.Element {
	if (!isStopped(row.status)) {
		return <span className="font-mono text-xs text-dim">{row.status}</span>;
	}

	return (
		<a
			href={`/runs/${encodeURIComponent(row.run)}/stages/${encodeURIComponent(stoppedStageOf(row.status))}`}
			className="inline-flex min-h-14 items-start self-start font-mono text-xs text-accent-foreground underline decoration-deeper underline-offset-4 hover:text-pale"
		>
			{row.status}
		</a>
	);
}

function outcomeCell(row: HistoryRow): React.JSX.Element {
	switch (row.kind) {
		case "run": {
			return runOutcomeCell(row);
		}
		case "session-attempt":
		case "replay": {
			return <span className="font-mono text-xs text-dim">{row.status}</span>;
		}
		case "group": {
			return <span className="text-xs text-dim">per rep</span>;
		}
		default: {
			return row satisfies never;
		}
	}
}

function runOutcomeCell(row: RunHistoryRow): React.JSX.Element {
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

type RowStaleness = HistoryRow["staleness"];
type JudgedStaleness = Extract<RowStaleness, { readonly state: "available" }>;

function causeList(causes: readonly string[]): readonly React.JSX.Element[] {
	return causes.map((cause, index) => (
		<span key={index} className="text-xs text-dim">
			{cause}
		</span>
	));
}

/**
 * TableShell keys its rows by index, so filtering the table hands a row's
 * cells to whatever Disclosure the previous row left mounted there, with its
 * open state intact. Keying by the row makes React remount it instead.
 */
function causesFor(
	row: HistoryRow,
	causes: readonly string[],
): React.ReactNode {
	if (causes.length <= 1) {
		return causeList(causes);
	}

	return (
		<Disclosure
			key={`${row.kind}:${identityOf(row)}`}
			collapsedLabel={`${causes.length} causes`}
			expandedLabel="hide causes"
		>
			{causeList(causes)}
		</Disclosure>
	);
}

function corpusCell(row: HistoryRow): React.JSX.Element {
	return (
		<span className="flex flex-col items-start gap-0.5">
			{row.corpusVersion?.kind === "version" ? (
				<span className="font-mono text-sm text-secondary-foreground">
					{corpusVersionLabel(row.corpusVersion.digest)}
				</span>
			) : (
				<span className="text-xs text-muted-foreground">
					{corpusMeasurementReading(row.corpusVersion)}
				</span>
			)}
			{row.kind === "run" && row.corpusChangedDuringRun ? (
				<span className="text-xs text-secondary-foreground">
					corpus changed during the run
				</span>
			) : null}
			{corpusState(row, row.staleness)}
		</span>
	);
}

function corpusState(
	row: HistoryRow,
	staleness: RowStaleness,
): React.JSX.Element {
	if (staleness.state === "unavailable") {
		return (
			<span className="text-xs text-muted-foreground">
				{staleness.reasons.join("; ")}
			</span>
		);
	}

	return (
		<>
			{judgment(staleness)}
			{causesFor(row, staleness.causes)}
		</>
	);
}

/**
 * The prototype's three readings, for a record judged against a version it
 * can count back to: clean at the version under test, and stale or
 * superseded when the server judged corpus files it read the only thing that
 * changed, counting an upstream stage gone stale from those same edits.
 * Every other judgment keeps the plain stale or clear badge, since the
 * prototype has no reading for a changed model, effort or settings file.
 */
function judgment(staleness: JudgedStaleness): React.JSX.Element {
	const { distance, onlyCorpusFiles } = staleness;

	if (
		distance.kind === "measured" &&
		!staleness.stale &&
		distance.versions === 0
	) {
		return (
			<span className="text-xs text-muted-foreground">
				<Status state="clean" />
			</span>
		);
	}
	if (
		distance.kind === "measured" &&
		onlyCorpusFiles &&
		distance.versions === 1
	) {
		return (
			<span className="text-xs text-secondary-foreground">
				<Status state="stale" /> · corpus changed since
			</span>
		);
	}
	if (
		distance.kind === "measured" &&
		onlyCorpusFiles &&
		distance.versions > 1
	) {
		return (
			<span className="text-xs text-secondary-foreground">
				<Status state="superseded" /> · {distance.versions} versions back
			</span>
		);
	}
	if (staleness.stale) {
		return (
			<span className="text-xs text-secondary-foreground">
				<Status state="stale" />
			</span>
		);
	}

	return (
		<span className="text-xs text-muted-foreground">
			<Status state="clear" />
		</span>
	);
}

function gradeCell(row: HistoryRow): React.JSX.Element {
	switch (row.kind) {
		case "run": {
			const value: GradeValue =
				row.grade === undefined ? { pending: true } : { letter: row.grade };

			return <Grade value={value} size="inline" />;
		}
		case "replay": {
			return <Grade value={{ letter: row.grade }} size="inline" />;
		}
		case "session-attempt":
		case "group": {
			return <span />;
		}
		default: {
			return row satisfies never;
		}
	}
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
			pipelineRuns(state.data?.rows ?? []).some(
				(row) => row.progress.state === "running",
			)
				? RUNNING_POLL_MS
				: false,
	});

	const unreadable = query.data?.unreadable ?? [];
	const recorded = query.data?.rows ?? [];
	const rows = recorded.filter((row) => matchesFilter(row, filter));
	const onlyUnreadableRecords = recorded.length === 0 && unreadable.length > 0;
	const nowMs = useNow(
		pipelineRuns(recorded).some((row) => row.progress.state === "running"),
	);

	return (
		<div>
			<ScreenHeader
				title="Run history"
				subline={
					query.isSuccess
						? `${plural(recorded.length, "record")} on disk · every pipeline run names the corpus version that produced it`
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

				{unreadable.length > 0 ? (
					<UnreadableRecords records={unreadable} />
				) : null}

				{query.isSuccess && rows.length === 0 && !onlyUnreadableRecords ? (
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
								<span key="run">{runCell(row)}</span>,
								<span key="case">{caseCell(row)}</span>,
								outcomeCell(row),
								row.kind === "run" ? progressCell(row, nowMs) : <span />,
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
