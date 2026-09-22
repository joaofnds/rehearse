import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type {
	SessionHistoryDetail,
	SessionHistoryEvent,
	SessionHistoryReport,
	SessionHistoryRequestEntry,
	SessionHistorySource,
	TextMeasurement,
} from "#benchmark/session-history";
import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";
import { Switcher } from "#client/system/components/switcher";
import {
	RequestTimeline,
	requestRowForLine,
	requestRowId,
} from "./request-timeline";
import "./session-history-page.css";

export type SessionHistoryIdentity =
	| {
			readonly kind: "standalone";
			readonly caseId: string;
			readonly uuid: string;
	  }
	| {
			readonly kind: "confirmation";
			readonly groupId: string;
			readonly repId: string;
	  }
	| {
			readonly kind: "stage";
			readonly run: string;
			readonly stage: string;
	  };

interface IdentityEntry {
	readonly term: string;
	readonly value: string;
}

/**
 * A stage checkpoint records no attempt id and no outcome, so the run, the
 * stage and the lineage place it instead. A stage that stopped wrote no
 * checkpoint, so it has no lineage to show and shows why it stopped instead.
 * A stage whose judging never completed wrote neither, so it shows neither:
 * the reason it has no transcript is the evidence's, not the identity's.
 */
function identityEntries(
	attempt: SessionHistoryReport["attempt"],
): readonly IdentityEntry[] {
	if (attempt.kind === "stage") {
		return [
			{ term: "Case", value: attempt.caseId },
			{ term: "Run", value: attempt.run },
			{ term: "Stage", value: attempt.stage },
			{ term: "Lineage", value: attempt.lineage },
			{ term: "Model", value: attempt.model },
		];
	}

	if (attempt.kind === "awaiting-judge-stage") {
		return [
			{ term: "Case", value: attempt.caseId },
			{ term: "Run", value: attempt.run },
			{ term: "Stage", value: attempt.stage },
			{ term: "Model", value: attempt.model },
		];
	}

	if (attempt.kind === "stopped-stage") {
		return [
			{ term: "Case", value: attempt.caseId },
			{ term: "Run", value: attempt.run },
			{ term: "Stage", value: attempt.stage },
			{ term: "Model", value: attempt.model },
			{ term: "Stopped because", value: attempt.error },
		];
	}

	return [
		{ term: "Case", value: attempt.caseId },
		{ term: "Attempt", value: attempt.id },
		{ term: "Model", value: attempt.model },
		{ term: "Outcome", value: attempt.outcome },
	];
}

type SourceSort = "Introduced" | "Most repeated";

function summaryPath(identity: SessionHistoryIdentity): string {
	if (identity.kind === "standalone") {
		return `/api/attempts/session/${encodeURIComponent(identity.caseId)}/${encodeURIComponent(identity.uuid)}/history`;
	}

	if (identity.kind === "stage") {
		return `/api/runs/${encodeURIComponent(identity.run)}/stages/${encodeURIComponent(identity.stage)}/history`;
	}

	return `/api/groups/${encodeURIComponent(identity.groupId)}/reps/${encodeURIComponent(identity.repId)}/attempt/history`;
}

async function fetchSummary(
	identity: SessionHistoryIdentity,
): Promise<SessionHistoryReport> {
	let response;
	if (identity.kind === "standalone") {
		response = await apiClient.api.attempts.session[":caseId"][
			":uuid"
		].history.$get({
			param: { caseId: identity.caseId, uuid: identity.uuid },
		});
	} else if (identity.kind === "stage") {
		response = await apiClient.api.runs[":run"].stages[":stage"].history.$get({
			param: { run: identity.run, stage: identity.stage },
		});
	} else {
		response = await apiClient.api.groups[":groupId"].reps[
			":repId"
		].attempt.history.$get({
			param: { groupId: identity.groupId, repId: identity.repId },
		});
	}
	if (!response.ok) {
		throw new Error(`Request failed with ${response.status}`);
	}

	return response.json();
}

/**
 * The response type comes from the route rather than from the reader's own
 * interface: JSON widens an optional field to admit an explicit undefined,
 * so the decoded shape is not the domain type and asserting it were would
 * hide exactly that difference.
 */
type RequestSeriesResponse = InferResponseType<
	(typeof apiClient.api.attempts.session)[":caseId"][":uuid"]["history"]["requests"]["$get"],
	200
>;

async function fetchRequestSeries(
	identity: SessionHistoryIdentity,
): Promise<RequestSeriesResponse> {
	if (identity.kind === "stage") {
		throw new Error("A saved stage records no request series");
	}
	const response =
		identity.kind === "standalone"
			? await apiClient.api.attempts.session[":caseId"][
					":uuid"
				].history.requests.$get({
					param: { caseId: identity.caseId, uuid: identity.uuid },
				})
			: await apiClient.api.groups[":groupId"].reps[
					":repId"
				].attempt.history.requests.$get({
					param: { groupId: identity.groupId, repId: identity.repId },
				});
	if (!response.ok) {
		throw new Error(`Request failed with ${response.status}`);
	}

	return response.json();
}

type StageCorpusResponse = InferResponseType<
	(typeof apiClient.api.runs)[":run"]["stages"][":stage"]["history"]["corpus"]["$get"],
	200
>;

async function fetchStageCorpus(
	run: string,
	stage: string,
): Promise<StageCorpusResponse> {
	const response = await apiClient.api.runs[":run"].stages[
		":stage"
	].history.corpus.$get({ param: { run, stage } });
	if (!response.ok) {
		throw new Error(`Request failed with ${response.status}`);
	}

	return response.json();
}

async function fetchDetail(
	identity: SessionHistoryIdentity,
	eventId: string,
): Promise<SessionHistoryDetail> {
	let response;
	if (identity.kind === "standalone") {
		response = await apiClient.api.attempts.session[":caseId"][":uuid"].history[
			":eventId"
		].$get({
			param: { caseId: identity.caseId, uuid: identity.uuid, eventId },
		});
	} else if (identity.kind === "stage") {
		response = await apiClient.api.runs[":run"].stages[":stage"].history[
			":eventId"
		].$get({
			param: { run: identity.run, stage: identity.stage, eventId },
		});
	} else {
		response = await apiClient.api.groups[":groupId"].reps[
			":repId"
		].attempt.history[":eventId"].$get({
			param: { groupId: identity.groupId, repId: identity.repId, eventId },
		});
	}
	if (!response.ok) {
		throw new Error(`Request failed with ${response.status}`);
	}

	return response.json();
}

function measurementLabel(measurement: TextMeasurement): string {
	if (measurement.state === "complete") {
		return `✓ Complete · ${measurement.characters} recorded text characters — not tokens`;
	}
	if (measurement.state === "partial") {
		return `◐ Partial · ${measurement.observedCharacters} observed recorded text characters — not tokens · ${measurement.reasons.join(", ")}`;
	}

	return `? Unavailable · ${measurement.reasons.join(", ")}`;
}

function eventStateLabel(state: SessionHistoryEvent["state"]): string {
	return {
		invoked: "▶ Invoked",
		delivered: "↓ Delivered",
		recorded: "• Recorded",
		failed: "✕ Failed",
		partial: "◐ Partial",
		unavailable: "? Unavailable",
	}[state];
}

function detailContentHeading(detail: SessionHistoryDetail): string {
	if (detail.state === "delivered") {
		return "Observed delivery";
	}

	return detail.kind === "result" ? "Saved result content" : "Recorded content";
}

function reportEvidenceLabel(report: SessionHistoryReport): string {
	if (report.boundary === "unknown") {
		return "? Unavailable · boundary unknown";
	}
	if (report.evidence.state === "unavailable") {
		return `? Unavailable · ${report.evidence.reasons.join(", ")}`;
	}
	if (report.evidence.state === "partial") {
		return `◐ Partial · ${report.evidence.reasons.join(", ")}`;
	}

	return `✓ Complete · ${report.startingContext.length} recorded events`;
}

/**
 * The first event the request owns, bounded above by the next request's line.
 * Without that bound a request that produced no event of its own, which is
 * every text-only assistant reply, selects the next request's event, and the
 * pane then highlights that other row rather than the one clicked.
 */
export function eventForRequestRow(
	entries: readonly SessionHistoryRequestEntry[],
	events: readonly SessionHistoryEvent[],
	entry: Readonly<SessionHistoryRequestEntry>,
): SessionHistoryEvent | undefined {
	return events.find(
		({ locator }) =>
			locator.line >= entry.line &&
			requestRowForLine(entries, locator.line) === requestRowId(entry),
	);
}

/**
 * The same ownership rule read a third way: a request stays visible when any
 * visible event belongs to it. Matching an event's line against a request's own
 * line instead would hide a request whose events all sit on later lines, which
 * is every request in a real transcript.
 */
export function requestRowsOwningEvents(
	entries: readonly SessionHistoryRequestEntry[],
	events: readonly SessionHistoryEvent[],
): readonly SessionHistoryRequestEntry[] {
	const owning = new Set(
		events.map(({ locator }) => requestRowForLine(entries, locator.line)),
	);

	return entries.filter((entry) => owning.has(requestRowId(entry)));
}

function locatorLabel(event: SessionHistoryEvent): string {
	return `${event.locator.line}:${event.locator.block}`;
}

function sortableCharacters(measurement: TextMeasurement): number {
	if (measurement.state === "complete") {
		return measurement.characters;
	}
	if (measurement.state === "partial") {
		return measurement.observedCharacters;
	}

	return -1;
}

function sortedSources(
	sources: readonly SessionHistorySource[],
	sort: SourceSort,
): readonly SessionHistorySource[] {
	return sources.toSorted((left, right) => {
		if (sort === "Most repeated") {
			const repeats =
				(right.observedDeliveryCount ?? -1) -
				(left.observedDeliveryCount ?? -1);
			if (repeats !== 0) {
				return repeats;
			}
		} else {
			const rank = { complete: 2, partial: 1, unavailable: 0 } as const;
			const leftCharacters = sortableCharacters(left.measurement);
			const rightCharacters = sortableCharacters(right.measurement);
			if (rightCharacters !== leftCharacters) {
				return rightCharacters - leftCharacters;
			}
			const state =
				rank[right.measurement.state] - rank[left.measurement.state];
			if (state !== 0) {
				return state;
			}
		}
		const line = left.firstLocator.line - right.firstLocator.line;
		if (line !== 0) {
			return line;
		}
		const block = left.firstLocator.block - right.firstLocator.block;
		if (block !== 0) {
			return block;
		}

		return left.name.localeCompare(right.name);
	});
}

function SourceList({
	sources,
	selected,
	sort,
	onSelect,
}: {
	readonly sources: readonly SessionHistorySource[];
	readonly selected: string | undefined;
	readonly sort: SourceSort;
	readonly onSelect: (source: SessionHistorySource | undefined) => void;
}): React.JSX.Element {
	return (
		<nav className="rh-history__sources" aria-label="Loaded sources">
			<button
				type="button"
				className="rh-history__source"
				aria-pressed={selected === undefined}
				onClick={() => {
					onSelect(undefined);
				}}
			>
				<span>All sources</span>
				<span>{sources.length}</span>
			</button>
			{sortedSources(sources, sort).map((source) => (
				<button
					type="button"
					key={source.id}
					className="rh-history__source"
					aria-pressed={selected === source.id}
					onClick={() => {
						onSelect(source);
					}}
				>
					<span>
						<strong>{source.name}</strong>
						<small>{source.kind}</small>
						<small>
							{source.failedOccurrences} failed · {source.partialOccurrences}{" "}
							partial · {source.missingOccurrences} missing ·{" "}
							{source.unavailableOccurrences} unavailable
						</small>
						<small>{measurementLabel(source.measurement)}</small>
						<small>
							{source.observedDeliveryCount === undefined
								? "? Unavailable observed deliveries · boundary unknown"
								: `${source.observedDeliveryCount} observed deliveries`}
						</small>
					</span>
					<span className="rh-history__count">
						{source.repeatDeliveryCount === undefined
							? "? Unavailable repeats"
							: `${source.repeatDeliveryCount}×`}
					</span>
				</button>
			))}
		</nav>
	);
}

function EventLedger({
	events,
	selected,
	onSelect,
}: {
	readonly events: readonly SessionHistoryEvent[];
	readonly selected: string | undefined;
	readonly onSelect: (id: string) => void;
}): React.JSX.Element {
	const active = selected ?? events[0]?.id;
	const move = (delta: number): void => {
		const index = Math.max(
			0,
			events.findIndex(({ id }) => id === active),
		);
		const next =
			events[Math.min(events.length - 1, Math.max(0, index + delta))];
		if (next !== undefined) {
			onSelect(next.id);
		}
	};

	return (
		<div
			className="rh-history__ledger"
			role="listbox"
			aria-label="Attempt events"
			tabIndex={0}
			onKeyDown={(event) => {
				if (event.key === "j" || event.key === "k") {
					event.preventDefault();
					move(event.key === "j" ? 1 : -1);
				}
			}}
		>
			{events.map((event) => (
				<button
					type="button"
					role="option"
					aria-selected={event.id === active}
					aria-current={event.id === active ? "true" : undefined}
					className="rh-history__event"
					key={event.id}
					onClick={() => {
						onSelect(event.id);
					}}
				>
					<code>{locatorLabel(event)}</code>
					<span>{event.label}</span>
					<span className="rh-history__event-state">
						<small>
							<span aria-hidden="true">{stateGlyph(event.state)}</span>{" "}
							{event.state}
						</small>
						{event.timestamp === undefined ? null : (
							<time>{event.timestamp}</time>
						)}
					</span>
				</button>
			))}
			{events.length === 0 ? <p>No events match this source.</p> : null}
		</div>
	);
}

function stateGlyph(state: SessionHistoryEvent["state"]): string {
	if (state === "failed") {
		return "×";
	}
	if (state === "partial") {
		return "≈";
	}
	if (state === "unavailable") {
		return "?";
	}
	if (state === "delivered") {
		return "↓";
	}

	return "▶";
}

function diagnosticLocators(
	report: SessionHistoryReport,
): readonly { readonly id: string; readonly label: string }[] {
	const { diagnostics } = report;
	if (diagnostics === undefined || diagnostics.state === "unavailable") {
		return [];
	}
	const entries: { readonly id: string; readonly label: string }[] = [];
	for (const toolError of diagnostics.toolErrors) {
		if (toolError.call !== undefined) {
			entries.push({
				id: `${toolError.call.line}:${toolError.call.block}`,
				label: "Tool error call",
			});
		}
		entries.push({
			id: `${toolError.result.line}:${toolError.result.block}`,
			label: "Tool error result",
		});
	}
	for (const command of diagnostics.repeatedBashCommands) {
		for (const { location } of command.occurrences) {
			entries.push({
				id: `${location.line}:${location.block}`,
				label: "Repeated Bash command",
			});
		}
	}
	for (const issue of diagnostics.issues) {
		for (const location of issue.locations) {
			entries.push({
				id: `${location.line}:${location.block}`,
				label: issue.kind,
			});
		}
	}
	const seen = new Set<string>();

	return entries.filter(({ id }) => {
		if (seen.has(id)) {
			return false;
		}
		seen.add(id);

		return true;
	});
}

function DetailPane({
	detail,
}: {
	readonly detail: SessionHistoryDetail;
}): React.JSX.Element {
	const contentHeading = detailContentHeading(detail);

	return (
		<div className="rh-history__detail-body">
			<header>
				<code>{`${detail.locator.line}:${detail.locator.block}`}</code>
				<span>{eventStateLabel(detail.state)}</span>
			</header>
			<section>
				<h3>{contentHeading}</h3>
				<p className="rh-history__measurement">
					{measurementLabel(detail.deliveredMeasurement)}
				</p>
				{detail.deliveredText === undefined ? (
					<p>Content unavailable.</p>
				) : (
					<pre>{detail.deliveredText}</pre>
				)}
			</section>
			<section>
				<h3>Structured source snapshot</h3>
				<p className="rh-history__measurement">
					{measurementLabel(detail.snapshotMeasurement)}
				</p>
				{detail.sourceSnapshotRange === undefined ? null : (
					<p className="rh-history__measurement">
						Lines {detail.sourceSnapshotRange.startLine}–
						{detail.sourceSnapshotRange.startLine +
							detail.sourceSnapshotRange.deliveredLineCount -
							1}{" "}
						of {detail.sourceSnapshotRange.totalLineCount} ·{" "}
						{detail.sourceSnapshotRange.coverage}
					</p>
				)}
				{detail.sourceSnapshot === undefined ? (
					<p>Snapshot unavailable.</p>
				) : (
					<pre>{detail.sourceSnapshot}</pre>
				)}
			</section>
			{detail.applicationTruncated ? (
				<p className="rh-history__notice">
					◐ Application-truncated · display capped at 65,536 UTF-8 bytes.
				</p>
			) : null}
		</div>
	);
}

/**
 * The pane occupies its grid column whether or not its query landed, so a
 * failed request leaves a named column with a reason in it rather than a
 * four-column grid with three panes and one silent gap.
 */
/**
 * A record that never held a request series is a different fact from one whose
 * series failed to load, and only the second is something the operator can act
 * on.
 */
function timelineNote(failed: boolean, recorded: boolean): string {
	if (!recorded) {
		return "A saved stage records no request series.";
	}

	return failed
		? "Could not load the request timeline."
		: "Loading the request timeline…";
}

/**
 * What a checkpoint declared, against what its transcript shows. An entry with
 * no matching read says no observation was recorded, never that the file was
 * not loaded: the transcript records deliveries, so its silence about a file is
 * an absence of evidence rather than evidence of absence.
 */
function DeclaredCorpusPane({
	entries,
}: {
	readonly entries: StageCorpusResponse;
}): React.JSX.Element {
	return (
		<section className="rh-history__corpus" aria-label="Declared corpus">
			<h2>Declared corpus</h2>
			<ul>
				{entries.map((entry) => (
					<li key={`${entry.state}:${entry.path}`}>
						<code>{entry.path}</code> <small>{corpusStateLabel(entry)}</small>
					</li>
				))}
			</ul>
		</section>
	);
}

function corpusStateLabel(entry: StageCorpusResponse[number]): string {
	const locator =
		entry.firstLocator === undefined
			? ""
			: ` · ${entry.firstLocator.line}:${entry.firstLocator.block}`;
	if (entry.state === "observed") {
		return `Observed${locator}`;
	}

	if (entry.state === "undeclared") {
		return `Undeclared${locator}`;
	}

	return "No observation recorded";
}

function RequestTimelinePane({
	read,
	failed,
	recorded,
	entries,
	selected,
	onSelect,
}: {
	readonly read: RequestSeriesResponse | undefined;
	readonly failed: boolean;
	readonly recorded: boolean;
	readonly entries: readonly SessionHistoryRequestEntry[];
	readonly selected: string | undefined;
	readonly onSelect: (entry: SessionHistoryRequestEntry) => void;
}): React.JSX.Element {
	if (read === undefined) {
		return (
			<section className="rh-timeline" aria-label="Request timeline">
				<h2>Request timeline</h2>
				<p
					className="rh-timeline__note"
					role={failed && recorded ? "alert" : undefined}
				>
					{timelineNote(failed, recorded)}
				</p>
			</section>
		);
	}

	return (
		<RequestTimeline
			series={read.series}
			entries={entries}
			cost={read.cost}
			requestCosts={read.requestCosts}
			instructionLoads={read.instructionLoads}
			selected={selected}
			onSelect={onSelect}
		/>
	);
}

export function SessionHistoryPage({
	identity,
}: {
	readonly identity: SessionHistoryIdentity;
}): React.JSX.Element {
	const path = summaryPath(identity);
	const [sourceId, setSourceId] = useState<string>();
	const [selectedEventId, setSelectedEventId] = useState<string>();
	const [sourceSort, setSourceSort] = useState<SourceSort>("Introduced");
	const summary = useQuery({
		queryKey: ["session-history", path],
		queryFn: () => fetchSummary(identity),
	});
	const recordsRequestSeries = identity.kind !== "stage";
	const stageCorpus = useQuery({
		queryKey: ["stage-corpus", path],
		queryFn: () =>
			identity.kind === "stage"
				? fetchStageCorpus(identity.run, identity.stage)
				: Promise.resolve([]),
		enabled: identity.kind === "stage",
	});
	const requests = useQuery({
		queryKey: ["session-history-requests", path],
		queryFn: () => fetchRequestSeries(identity),
		enabled: recordsRequestSeries,
	});
	const events = useMemo(() => {
		let all: readonly SessionHistoryEvent[] = [];
		if (summary.data !== undefined) {
			all =
				summary.data.boundary === "unknown"
					? summary.data.boundaryUnknown
					: summary.data.attemptEvents;
		}
		return sourceId === undefined
			? all
			: all.filter((event) => event.sourceId === sourceId);
	}, [sourceId, summary.data]);
	const activeEventId = events.some(({ id }) => id === selectedEventId)
		? selectedEventId
		: events[0]?.id;
	const detail = useQuery({
		queryKey: ["session-history-detail", path, activeEventId],
		queryFn: () => fetchDetail(identity, activeEventId ?? ""),
		enabled: activeEventId !== undefined,
	});
	const diagnostics =
		summary.data === undefined ? [] : diagnosticLocators(summary.data);
	const timelineEntries = requests.data?.series.entries ?? [];
	const selectedEvent = events.find(({ id }) => id === activeEventId);
	/**
	 * Both panes key off the transcript line: a request and the events recorded
	 * for it share one, which is the only identifier the two readings have in
	 * common. Filtering the event pane therefore narrows the timeline too.
	 */
	const selectedRequestRow = requestRowForLine(
		timelineEntries,
		selectedEvent?.locator.line,
	);
	const visibleEntries =
		sourceId === undefined
			? timelineEntries
			: requestRowsOwningEvents(timelineEntries, events);

	return (
		<main className="rh-history">
			<a className="rh-history__back" href="/">
				← Back to run history
			</a>
			<header className="rh-history__header">
				<div>
					<p className="rh-history__eyebrow">ATTEMPT EVIDENCE</p>
					<h1>Saved context history</h1>
				</div>
				{summary.data === undefined ? null : (
					<dl>
						{identityEntries(summary.data.attempt).map(({ term, value }) => (
							<div key={term}>
								<dt>{term}</dt>
								<dd>{value}</dd>
							</div>
						))}
					</dl>
				)}
			</header>
			{summary.isLoading ? <p>Loading history…</p> : null}
			{summary.isError ? (
				<p role="alert">Could not load saved history.</p>
			) : null}
			{summary.data === undefined ? null : (
				<>
					<section
						className="rh-history__starting"
						aria-label="Starting context"
					>
						<div>
							<span>
								{summary.data.boundary === "unknown"
									? "Boundary unknown"
									: "Starting context"}
							</span>
							{summary.data.startingContext.map((event) => (
								<small key={event.id}>
									<code>{locatorLabel(event)}</code> {event.label}
								</small>
							))}
						</div>
						<strong>{reportEvidenceLabel(summary.data)}</strong>
					</section>
					{stageCorpus.data === undefined ? null : (
						<DeclaredCorpusPane entries={stageCorpus.data} />
					)}
					<div className="rh-history__toolbar">
						<span>Sort sources</span>
						<Switcher
							label="Sort sources"
							options={["Introduced", "Most repeated"]}
							selected={sourceSort}
							onSelect={setSourceSort}
						/>
					</div>
					{diagnostics.length === 0 ? null : (
						<nav
							className="rh-history__diagnostics"
							aria-label="Transcript diagnostics"
						>
							{diagnostics.map((entry) => (
								<button
									key={entry.id}
									type="button"
									onClick={() => {
										setSourceId(undefined);
										setSelectedEventId(entry.id);
									}}
								>
									<code>{entry.id}</code> {entry.label}
								</button>
							))}
						</nav>
					)}
					<div className="rh-history__workbench">
						<SourceList
							sources={summary.data.sources}
							selected={sourceId}
							sort={sourceSort}
							onSelect={(source) => {
								const allEvents =
									summary.data.boundary === "unknown"
										? summary.data.boundaryUnknown
										: summary.data.attemptEvents;
								const nextEvents =
									source === undefined
										? allEvents
										: allEvents.filter(({ id }) =>
												source.eventIds.includes(id),
											);
								setSourceId(source?.id);
								setSelectedEventId((current) =>
									current !== undefined &&
									nextEvents.some(({ id }) => id === current)
										? current
										: nextEvents[0]?.id,
								);
							}}
						/>
						<section className="rh-history__events" aria-label="Event ledger">
							<h2>
								{summary.data.boundary === "unknown"
									? "Boundary-unknown events"
									: "Attempt events"}
							</h2>
							<EventLedger
								events={events}
								selected={activeEventId}
								onSelect={setSelectedEventId}
							/>
						</section>
						<RequestTimelinePane
							read={requests.data}
							failed={requests.isError}
							recorded={recordsRequestSeries}
							entries={visibleEntries}
							selected={selectedRequestRow}
							onSelect={(entry) => {
								const target = eventForRequestRow(
									timelineEntries,
									events,
									entry,
								);
								if (target !== undefined) {
									setSelectedEventId(target.id);
								}
							}}
						/>
						<aside className="rh-history__detail" aria-label="Event detail">
							<h2>Evidence detail</h2>
							{detail.isLoading ? <p>Loading evidence…</p> : null}
							{detail.isError ? (
								<p role="alert">Could not load event evidence.</p>
							) : null}
							{detail.data === undefined ? null : (
								<DetailPane detail={detail.data} />
							)}
						</aside>
					</div>
				</>
			)}
		</main>
	);
}
