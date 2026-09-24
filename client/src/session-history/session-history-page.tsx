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
import { cn } from "cn";
import { ScreenHeader } from "#client/system/components/screen-header";
import { SectionLabel } from "#client/system/components/section-label";
import { PaneHeading } from "./pane-heading";
import { selectableRow } from "./selectable-row";
import { attemptLabel } from "#client/attempt-label";
import type { AttemptPosition } from "#client/attempt-label";
import { runHistoryQuery } from "#client/run-history/run-history-query";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";

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
	  }
	| {
			readonly kind: "replay";
			readonly lineage: string;
			readonly timestamp: string;
	  };

interface IdentityEntry {
	readonly term: string;
	readonly value: string;
	/**
	 * The Record ID part a short id or position stands in for, shown beneath
	 * it, since the short id is an alias and the Record ID stays canonical.
	 */
	readonly filedUnder?: string;
}

type HistoryRow = RunHistoryResponse["rows"][number];

/** What run history calls the record a page shows. */
interface RecordNames {
	readonly shortId: string | undefined;
	/** A replay's source run, which the page names beside the replay itself. */
	readonly runShortId: string | undefined;
	readonly checkpointShortId: string | undefined;
	readonly attempt: AttemptPosition | undefined;
}

const UNNAMED: RecordNames = {
	shortId: undefined,
	runShortId: undefined,
	checkpointShortId: undefined,
	attempt: undefined,
};

type RunRow = Extract<HistoryRow, { kind: "run" }>;
type ReplayRow = Extract<HistoryRow, { kind: "replay" }>;
type SessionAttemptRow = Extract<HistoryRow, { kind: "session-attempt" }>;
type GroupRow = Extract<HistoryRow, { kind: "group" }>;

/**
 * The shell loads run history on every page, so a page reads its record's
 * names from that report rather than asking its own route to name it again.
 * A stage page's checkpoint is the one the stage recorded; a replay's is the
 * one it started from.
 */
function recordNames(
	identity: SessionHistoryIdentity,
	rows: readonly HistoryRow[],
	sourceRun: string | undefined,
): RecordNames {
	switch (identity.kind) {
		case "stage": {
			const row = rows.find(
				(candidate): candidate is RunRow =>
					candidate.kind === "run" && candidate.run === identity.run,
			);

			return {
				...UNNAMED,
				shortId: row?.shortId,
				checkpointShortId: row?.checkpoints.find(
					({ stage }) => stage === identity.stage,
				)?.shortId,
			};
		}
		case "replay": {
			const row = rows.find(
				(candidate): candidate is ReplayRow =>
					candidate.kind === "replay" &&
					candidate.lineage === identity.lineage &&
					candidate.timestamp === identity.timestamp,
			);

			return row === undefined
				? UNNAMED
				: {
						shortId: row.shortId,
						runShortId: rows.find(
							(candidate): candidate is RunRow =>
								candidate.kind === "run" && candidate.run === sourceRun,
						)?.shortId,
						checkpointShortId: row.checkpointShortId,
						attempt: row.attempt,
					};
		}
		case "standalone": {
			const row = rows.find(
				(candidate): candidate is SessionAttemptRow =>
					candidate.kind === "session-attempt" &&
					candidate.caseId === identity.caseId &&
					candidate.uuid === identity.uuid,
			);

			return { ...UNNAMED, shortId: row?.shortId };
		}
		case "confirmation": {
			const row = rows.find(
				(candidate): candidate is GroupRow =>
					candidate.kind === "group" && candidate.groupId === identity.groupId,
			);

			return {
				...UNNAMED,
				shortId: row?.shortId,
				attempt: row?.repAttempts.find(({ repId }) => repId === identity.repId)
					?.attempt,
			};
		}
		default: {
			return identity satisfies never;
		}
	}
}

/** The entry for a term shows its short id or position, with what it is filed under beneath. */
function named(
	entries: readonly IdentityEntry[],
	term: string,
	value: string | undefined,
): readonly IdentityEntry[] {
	return value === undefined
		? entries
		: entries.map((entry) =>
				entry.term === term ? { term, value, filedUnder: entry.value } : entry,
			);
}

function inserted(
	entries: readonly IdentityEntry[],
	afterTerm: string,
	added: readonly (IdentityEntry | undefined)[],
): readonly IdentityEntry[] {
	const present = added.filter((entry) => entry !== undefined);

	return entries.flatMap((entry) =>
		entry.term === afterTerm ? [entry, ...present] : [entry],
	);
}

function entryOf(
	term: string,
	value: string | undefined,
): IdentityEntry | undefined {
	return value === undefined ? undefined : { term, value };
}

/**
 * The run a stage report names, which a session attempt and a report still
 * loading have none of.
 */
function runOf(report: SessionHistoryReport | undefined): string | undefined {
	return report === undefined || report.attempt.kind === "session"
		? undefined
		: report.attempt.run;
}

function namedEntries(
	identity: SessionHistoryIdentity,
	attempt: SessionHistoryReport["attempt"],
	names: RecordNames,
): readonly IdentityEntry[] {
	const entries = identityEntries(attempt);
	const attemptOf =
		names.attempt === undefined ? undefined : attemptLabel(names.attempt);
	switch (identity.kind) {
		case "stage": {
			return inserted(named(entries, "Run", names.shortId), "Stage", [
				entryOf("Checkpoint", names.checkpointShortId),
			]);
		}
		case "replay": {
			const replay =
				names.shortId === undefined
					? undefined
					: {
							term: "Replay",
							value: names.shortId,
							filedUnder: identity.timestamp,
						};

			return inserted(
				inserted(named(entries, "Run", names.runShortId), "Case", [replay]),
				"Stage",
				[
					entryOf("Started from", names.checkpointShortId),
					entryOf("Attempt", attemptOf),
				],
			);
		}
		case "standalone": {
			return named(entries, "Attempt", names.shortId);
		}
		case "confirmation": {
			const position =
				attemptOf === undefined || names.shortId === undefined
					? attemptOf
					: `${attemptOf} of ${names.shortId}`;

			return named(entries, "Attempt", position);
		}
		default: {
			return identity satisfies never;
		}
	}
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

	if (attempt.kind === "session") {
		return [
			{ term: "Case", value: attempt.caseId },
			{ term: "Attempt", value: attempt.id },
			{ term: "Model", value: attempt.model },
			{ term: "Outcome", value: attempt.outcome },
		];
	}

	return attempt satisfies never;
}

type SourceSort = "Introduced" | "Most repeated";

function summaryPath(identity: SessionHistoryIdentity): string {
	if (identity.kind === "standalone") {
		return `/api/attempts/session/${encodeURIComponent(identity.caseId)}/${encodeURIComponent(identity.uuid)}/history`;
	}

	if (identity.kind === "stage") {
		return `/api/runs/${encodeURIComponent(identity.run)}/stages/${encodeURIComponent(identity.stage)}/history`;
	}

	if (identity.kind === "replay") {
		return `/api/replays/${encodeURIComponent(identity.lineage)}/${encodeURIComponent(identity.timestamp)}/history`;
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
	} else if (identity.kind === "replay") {
		response = await apiClient.api.replays[":lineage"][
			":timestamp"
		].history.$get({
			param: { lineage: identity.lineage, timestamp: identity.timestamp },
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
	if (identity.kind === "stage" || identity.kind === "replay") {
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
	} else if (identity.kind === "replay") {
		throw new Error("A replay serves no per-event evidence detail");
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

const DETAIL_SECTION_CLASSES =
	"flex flex-col gap-2 border-t border-subtle px-3 py-3";

const EVIDENCE_TEXT_CLASSES =
	"max-h-96 overflow-auto rounded-md bg-background p-2.5 font-mono text-sm break-words whitespace-pre-wrap text-secondary-foreground";

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
		<nav aria-label="Loaded sources">
			<button
				type="button"
				className={cn(
					selectableRow({ markedBy: "pressed" }),
					"flex flex-col gap-1",
				)}
				aria-pressed={selected === undefined}
				onClick={() => {
					onSelect(undefined);
				}}
			>
				<span className="flex items-baseline justify-between gap-2.5">
					<span>All sources</span>
					<span className="font-mono text-accent-foreground">
						{sources.length}
					</span>
				</span>
			</button>
			{sortedSources(sources, sort).map((source) => (
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
					<span className="flex items-baseline justify-between gap-2.5">
						<strong className="min-w-0 font-medium break-words">
							{source.name}
						</strong>
						{source.repeatDeliveryCount === undefined ? null : (
							<span className="shrink-0 font-mono text-accent-foreground">
								{`${source.repeatDeliveryCount}×`}
							</span>
						)}
					</span>
					<small>
						<SectionLabel>{source.kind}</SectionLabel>
					</small>
					<small className="text-xs text-dim">
						{source.failedOccurrences} failed · {source.partialOccurrences}{" "}
						partial · {source.missingOccurrences} missing ·{" "}
						{source.unavailableOccurrences} unavailable
					</small>
					<small className="text-xs text-dim">
						{measurementLabel(source.measurement)}
					</small>
					<small className="text-xs text-dim">
						{source.observedDeliveryCount === undefined
							? "? Unavailable observed deliveries · boundary unknown"
							: `${source.observedDeliveryCount} observed deliveries`}
					</small>
					{source.repeatDeliveryCount === undefined ? (
						<small className="text-xs text-dim">? Unavailable repeats</small>
					) : null}
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
			className="focus-visible:-outline-offset-2"
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
					className={cn(
						selectableRow({ markedBy: "selected" }),
						"flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5",
					)}
					key={event.id}
					onClick={() => {
						onSelect(event.id);
					}}
				>
					<code className="w-14 shrink-0 font-mono text-xs text-accent-foreground">
						{locatorLabel(event)}
					</code>
					<span className="min-w-0 flex-1">{event.label}</span>
					<small className="shrink-0">
						<SectionLabel>
							<span aria-hidden="true">{stateGlyph(event.state)}</span>{" "}
							{event.state}
						</SectionLabel>
					</small>
					{event.timestamp === undefined ? null : (
						<time className="basis-full pl-16.5 font-mono text-xs text-dim">
							{event.timestamp}
						</time>
					)}
				</button>
			))}
			{events.length === 0 ? (
				<p className="px-3 py-2.5 text-sm text-dim">
					No events match this source.
				</p>
			) : null}
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
		<div>
			<header className="flex justify-between gap-2.5 px-3 py-2.5 text-muted-foreground">
				<code className="font-mono text-xs text-accent-foreground">{`${detail.locator.line}:${detail.locator.block}`}</code>
				<span>{eventStateLabel(detail.state)}</span>
			</header>
			<section className={DETAIL_SECTION_CLASSES}>
				<h3 className="text-sm font-medium">{contentHeading}</h3>
				<p className="text-xs text-dim">
					{measurementLabel(detail.deliveredMeasurement)}
				</p>
				{detail.deliveredText === undefined ? (
					<p>Content unavailable.</p>
				) : (
					<pre className={EVIDENCE_TEXT_CLASSES}>{detail.deliveredText}</pre>
				)}
			</section>
			<section className={DETAIL_SECTION_CLASSES}>
				<h3 className="text-sm font-medium">Structured source snapshot</h3>
				<p className="text-xs text-dim">
					{measurementLabel(detail.snapshotMeasurement)}
				</p>
				{detail.sourceSnapshotRange === undefined ? null : (
					<p className="text-xs text-dim">
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
					<pre className={EVIDENCE_TEXT_CLASSES}>{detail.sourceSnapshot}</pre>
				)}
			</section>
			{detail.applicationTruncated ? (
				<p className="px-3 py-2.5 text-xs text-dim">
					◐ Application-truncated · display capped at 65,536 UTF-8 bytes.
				</p>
			) : null}
		</div>
	);
}

function EvidenceDetail({
	served,
	loading,
	failed,
	detail,
}: {
	readonly served: boolean;
	readonly loading: boolean;
	readonly failed: boolean;
	readonly detail: SessionHistoryDetail | undefined;
}): React.JSX.Element | null {
	if (!served) {
		return (
			<p className="px-3 py-2.5 text-sm text-dim">
				A replay serves no per-event evidence detail.
			</p>
		);
	}
	if (loading) {
		return <p className="px-3 py-2.5 text-sm text-dim">Loading evidence…</p>;
	}
	if (failed) {
		return (
			<p role="alert" className="px-3 py-2.5 text-sm text-dim">
				<span aria-hidden="true">⚠ </span>
				Could not load event evidence.
			</p>
		);
	}

	return detail === undefined ? null : <DetailPane detail={detail} />;
}

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
		<section
			aria-label="Declared corpus"
			className="rounded-lg border bg-muted px-4 py-3 text-secondary-foreground"
		>
			<h2>
				<SectionLabel>Declared corpus</SectionLabel>
			</h2>
			<ul className="mt-2 flex flex-col gap-1">
				{entries.map((entry) => (
					<li key={`${entry.state}:${entry.path}`}>
						<code className="font-mono text-sm">{entry.path}</code>{" "}
						<small className="text-xs text-dim">
							{corpusStateLabel(entry)}
						</small>
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
			<section aria-label="Request timeline">
				<PaneHeading>Request timeline</PaneHeading>
				<p
					className="px-3 py-2.5 text-xs text-dim"
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
	const runHistory = useQuery(runHistoryQuery);
	const names = recordNames(
		identity,
		runHistory.data?.rows ?? [],
		runOf(summary.data),
	);
	const recordsRequestSeries =
		identity.kind === "standalone" || identity.kind === "confirmation";
	/**
	 * The server reads a replay's summary only: no route serves one event's
	 * evidence from a replay, so the detail pane says so instead of asking.
	 */
	const servesEventDetail = identity.kind !== "replay";
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
		enabled: servesEventDetail && activeEventId !== undefined,
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
		<div className="flex min-h-screen flex-col">
			<ScreenHeader
				title="Saved context history"
				eyebrow="Attempt evidence"
				lead={
					<a
						href="/"
						className="text-sm text-muted-foreground hover:text-foreground"
					>
						← Back to run history
					</a>
				}
				aside={
					summary.data === undefined ? undefined : (
						<dl className="flex flex-wrap gap-x-5 gap-y-2">
							{namedEntries(identity, summary.data.attempt, names).map(
								({ term, value, filedUnder }) => (
									<div key={term} className="flex flex-col gap-1">
										<dt>
											<SectionLabel>{term}</SectionLabel>
										</dt>
										<dd className="flex flex-col gap-0.5">
											<span className="font-mono text-sm">{value}</span>
											{filedUnder === undefined ? null : (
												<span className="font-mono text-xs text-dim">
													{filedUnder}
												</span>
											)}
										</dd>
									</div>
								),
							)}
						</dl>
					)
				}
			/>
			<div className="flex flex-1 flex-col gap-4 px-6 pt-4 pb-12">
				{summary.isLoading ? (
					<p className="text-muted-foreground">Loading history…</p>
				) : null}
				{summary.isError ? (
					<p role="alert" className="text-muted-foreground">
						<span aria-hidden="true">⚠ </span>
						Could not load saved history.
					</p>
				) : null}
				{summary.data === undefined ? null : (
					<>
						<section
							aria-label="Starting context"
							className="flex flex-wrap justify-between gap-4 rounded-lg border bg-muted px-4 py-3 text-secondary-foreground"
						>
							<div className="flex flex-col gap-1">
								<span>
									{summary.data.boundary === "unknown"
										? "Boundary unknown"
										: "Starting context"}
								</span>
								{summary.data.startingContext.map((event) => (
									<small key={event.id} className="text-sm text-dim">
										<code className="font-mono text-accent-foreground">
											{locatorLabel(event)}
										</code>{" "}
										{event.label}
									</small>
								))}
							</div>
							<strong className="font-mono text-sm">
								{reportEvidenceLabel(summary.data)}
							</strong>
						</section>
						{stageCorpus.data === undefined ? null : (
							<DeclaredCorpusPane entries={stageCorpus.data} />
						)}
						<div className="flex items-center gap-2 text-sm text-dim">
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
								aria-label="Transcript diagnostics"
								className="flex gap-1.5 overflow-x-auto"
							>
								{diagnostics.map((entry) => (
									<button
										key={entry.id}
										type="button"
										className="min-h-14 shrink-0 rounded-md border bg-muted px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:border-primary hover:bg-accent"
										onClick={() => {
											setSourceId(undefined);
											setSelectedEventId(entry.id);
										}}
									>
										<code className="font-mono text-accent-foreground">
											{entry.id}
										</code>{" "}
										{entry.label}
									</button>
								))}
							</nav>
						)}
						{/* min-w-330 covers the four pane floors and the borders, so a narrow column scrolls the panes rather than crushing them. */}
						<div className="flex min-h-96 flex-1 overflow-x-auto">
							<div className="flex min-w-330 flex-1 overflow-hidden rounded-lg border bg-card">
								<div className="min-w-58 flex-7 border-r">
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
								</div>
								<section
									aria-label="Event ledger"
									className="min-w-80 flex-10 border-r"
								>
									<PaneHeading>
										{summary.data.boundary === "unknown"
											? "Boundary-unknown events"
											: "Attempt events"}
									</PaneHeading>
									<EventLedger
										events={events}
										selected={activeEventId}
										onSelect={setSelectedEventId}
									/>
								</section>
								<div className="min-w-92 flex-12 border-r">
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
								</div>
								<aside aria-label="Event detail" className="min-w-98 flex-13">
									<PaneHeading>Evidence detail</PaneHeading>
									<EvidenceDetail
										served={servesEventDetail}
										loading={detail.isLoading}
										failed={detail.isError}
										detail={detail.data}
									/>
								</aside>
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
