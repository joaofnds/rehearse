import { SearchInput } from "#client/system/ui/search-input";
import { NativeSelect } from "#client/system/ui/native-select";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useId, useState } from "react";
import { Disclosure } from "#client/system/components/disclosure";
import { EmptyState } from "#client/system/components/empty-state";
import { FilterPill } from "#client/system/components/filter-pill";
import { Status } from "#client/system/components/status";
import { StateBadge } from "#client/system/components/state-badge";
import type { StatusState, StatusTone } from "#client/system/components/status";
import { TableShell } from "#client/system/components/table-shell";
import { Button } from "#client/system/ui/button";
import { KeyHint } from "#client/system/components/key-hint";
import { withinCase } from "#client/within-case";
import { clockReading, liveElapsedMs, spendReading } from "./run-progress";
import { listedEntryCount } from "./run-history-query";
import type { RunHistoryResponse } from "./run-history-query";
import { useRunHistory } from "./use-run-history";
import { useNow } from "./use-now";
import { recordMoment } from "./record-moment";
import { runStatusState } from "./run-status";
import {
	corpusMeasurementReading,
	corpusVersionLabel,
} from "#benchmark/corpus-version-label";
import { recordedInstant } from "#benchmark/recorded-instant";
import { isStopped, stoppedStageOf } from "#benchmark/stopped-status";
import { attemptLabel } from "#client/attempt-label";
import { plural } from "#client/plural";
import { ScreenHeader } from "#client/system/components/screen-header";
import { SavedStateSummary } from "#client/saved-state-summary";
import { SummaryPanel } from "#client/system/components/summary-panel";

import { LaunchDialog } from "#client/launch/launch-dialog";
import { launchSettingsQuery } from "#client/launch/settings-query";
import {
	JUDGED_NOTE,
	NOT_RETURNED,
	outcomeReading,
} from "#client/run-detail/task-grade-card";
import type { OutcomeReading } from "#client/run-detail/task-grade-card";
import { SESSION_GRADE_REASON } from "#server/session-grade-reason";
import { isClean } from "./clean-record";
import {
	useRememberRunsSearch,
	matchesDiscovery,
	launchMatchesDiscovery,
	recordIdentity,
	recordedTime,
	sortDiscoveredRows,
} from "./run-discovery";
import type { RunDiscoverySearch } from "./run-discovery";
import { RunControls } from "./run-controls";
import type { InvalidatedSelection } from "./invalidated-selection";
import {
	InvalidatedNotice,
	readOf,
	useInvalidatedSelection,
} from "./invalidated-view";
import { replayOffer } from "./replay-choices";
import type { ReplayOffer } from "./replay-choices";

type HistoryRow = RunHistoryResponse["rows"][number];
type RunHistoryRow = Extract<HistoryRow, { readonly kind: "run" }>;
type RunningProgress = Extract<
	RunHistoryRow["progress"],
	{ readonly state: "running" }
>;
type ContextLink = HistoryRow["links"][number];

function pipelineRuns(rows: readonly HistoryRow[]): readonly RunHistoryRow[] {
	return rows.filter((row): row is RunHistoryRow => row.kind === "run");
}
type UnreadableRecord = RunHistoryResponse["unreadable"][number];
type LaunchRow = RunHistoryResponse["launches"][number];

const COLUMNS = [
	"Run",
	"Case",
	"Outcome",
	"Step grades",
	"Final outcome",
	"Corpus",
	"Cost",
	"Wall",
] as const;

const NUMERIC_COLUMNS = ["Cost", "Wall"] as const;

const UNREADABLE_NOUNS = {
	run: ["run", "runs"],
	"session-attempt": ["session attempt", "session attempts"],
	replay: ["replay", "replays"],
	group: ["confirmation run", "confirmation runs"],
	launch: ["launch", "launches"],
	"short-ids": ["short id registry", "short id registries"],
} as const satisfies Readonly<
	Record<UnreadableRecord["kind"], readonly [string, string]>
>;

function unreadableSummary(
	records: readonly UnreadableRecord[],
): readonly string[] {
	return Object.entries(UNREADABLE_NOUNS).flatMap(
		([kind, [noun, nounPlural]]) => {
			const count = records.filter((record) => record.kind === kind).length;

			return count === 0 ? [] : [plural(count, noun, nounPlural)];
		},
	);
}

function UnreadableRecords({
	records,
}: {
	readonly records: readonly UnreadableRecord[];
}): React.JSX.Element {
	return (
		<div
			role="alert"
			className="flex flex-wrap items-center gap-x-2 rounded-md border-l-3 border-attention bg-attention-surface px-4 py-3 text-14 text-attention"
		>
			<p>
				<span aria-hidden="true">⚠ </span>
				{`${unreadableSummary(records).join(", ")} could not be read, so the table leaves them out.`}
			</p>
			<Disclosure
				collapsedLabel={`show ${records.length}`}
				expandedLabel="hide"
			>
				<ul className="flex flex-col gap-1 font-mono text-14">
					{records.map(({ id, reason }) => (
						<li key={id}>{`${id}: ${reason}`}</li>
					))}
				</ul>
			</Disclosure>
		</div>
	);
}

/** What kind of record the row is, in the design's few words. */
function kindLine(row: HistoryRow): string {
	switch (row.kind) {
		case "run": {
			return row.stageGrades.state === "available"
				? `task · ${plural(row.stageGrades.grades.length, "step")}`
				: "task";
		}
		case "session-attempt": {
			return "single session";
		}
		case "replay": {
			return [
				`replay ${row.stage}`,
				row.checkpointShortId === undefined
					? undefined
					: withinCase(row.checkpointShortId, row.caseId),
				row.attempt === undefined ? undefined : attemptLabel(row.attempt),
			]
				.filter((part) => part !== undefined)
				.join(" · ");
		}
		case "group": {
			return `group · ${plural(row.reps, "rep")} · ${row.mode}`;
		}
		default: {
			return row satisfies never;
		}
	}
}

function momentOf(row: HistoryRow, nowMs: number): string {
	const time = recordedTime(row);
	const instant = time === undefined ? undefined : recordedInstant(time);

	return instant === undefined
		? "time not recorded"
		: recordMoment(instant, nowMs);
}

/** The context page a replay or session attempt opens, which is the record itself. */
function recordContext(row: HistoryRow): string | undefined {
	if (row.kind !== "replay" && row.kind !== "session-attempt") {
		return undefined;
	}

	return row.links.flatMap((link) =>
		link.state === "available" ? [link.href] : [],
	)[0];
}

const RECORD_NAME_CLASS =
	"self-start font-mono text-14 text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover";

/** A record's name opens its run detail or its context page, where it has one. */
function recordName(row: HistoryRow, name: string): React.JSX.Element {
	if (row.kind === "run") {
		return (
			<Link
				to="/runs/$run"
				params={{ run: row.run }}
				search={{
					view: row.progress.state === "running" ? "activity" : "results",
				}}
				className={RECORD_NAME_CLASS}
			>
				{name}
			</Link>
		);
	}

	if (row.kind === "group") {
		return (
			<Link
				to="/groups/$groupId"
				params={{ groupId: row.groupId }}
				className={RECORD_NAME_CLASS}
			>
				{name}
			</Link>
		);
	}

	const context = recordContext(row);
	if (context === undefined) {
		return <span className="font-mono text-14">{name}</span>;
	}

	return (
		<a href={context} className={RECORD_NAME_CLASS}>
			{name}
		</a>
	);
}

/** The record's short id within its case, with when it ran beneath. */
function runCell(row: HistoryRow, nowMs: number): React.JSX.Element {
	const name =
		row.shortId === undefined
			? recordIdentity(row)
			: withinCase(row.shortId, row.caseId);

	return (
		<span className="flex flex-col gap-0.5">
			{recordName(row, name)}
			<span className="font-mono text-12 text-dim">{momentOf(row, nowMs)}</span>
		</span>
	);
}

const LINK_CLASS =
	"inline-flex min-h-touch-target items-center justify-center rounded-md border border-divider bg-muted px-2 text-14 text-link no-underline hover:border-strong hover:bg-row-hover hover:no-underline";

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
				<span key={link.label} className="text-12 text-dim">
					{`${link.label} · ${link.reason}`}
				</span>
			);
		}
		default: {
			return link satisfies never;
		}
	}
}

/** The links the case cell lists: every one but the context the run cell opens. */
function caseLinks(row: HistoryRow): readonly ContextLink[] {
	if (row.kind === "group") {
		return [];
	}
	return recordContext(row) === undefined
		? row.links
		: row.links.filter((link) => link.state !== "available");
}

function caseCell(row: HistoryRow): React.JSX.Element {
	const links = caseLinks(row);

	return (
		<span className="flex flex-col items-start gap-0.5">
			{row.caseId === undefined ? (
				<span className="text-14 text-dim">case not recorded</span>
			) : (
				<Link
					to="/cases"
					search={{ caseId: row.caseId }}
					className="font-mono text-14 text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover"
				>
					{row.caseId}
				</Link>
			)}
			<span className="text-12 text-dim">{kindLine(row)}</span>
			{links.length > 0 ? (
				<span className="mt-2 flex flex-col gap-1.5">
					<span className="text-12 text-muted-foreground">Saved sessions</span>
					<span className="flex flex-wrap gap-2">
						{links.map((link) => contextLink(link))}
					</span>
				</span>
			) : null}
		</span>
	);
}

type GroupRow = Extract<HistoryRow, { readonly kind: "group" }>;

/** A stage group chosen as one arm of a comparison, in the order chosen. */
interface ChosenArm {
	readonly groupId: string;
	readonly run: string;
	readonly stage: string;
	readonly reps: number;
}

interface ArmChoice {
	readonly chosen: readonly ChosenArm[];
	readonly onToggle: (arm: ChosenArm) => void;
}

/**
 * Only a stage group whose claim records the checkpoint it replayed can be
 * an arm, and a second arm must share the first one's checkpoint.
 */
function CompareChoice({
	row,
	choice,
}: {
	readonly row: GroupRow;
	readonly choice: ArmChoice;
}): React.JSX.Element | null {
	const { checkpoint } = row;
	if (row.mode !== "stage" || checkpoint === undefined) {
		return null;
	}
	const { chosen, onToggle } = choice;
	const checked = chosen.some(({ groupId }) => groupId === row.groupId);
	const [first] = chosen;
	const offered =
		checked ||
		first === undefined ||
		(chosen.length < 2 &&
			first.run === checkpoint.run &&
			first.stage === checkpoint.stage);

	return (
		<label className="flex items-center gap-2 text-12 text-dim">
			<input
				type="checkbox"
				aria-label={`Compare ${row.groupId}`}
				checked={checked}
				disabled={!offered}
				onChange={() => {
					onToggle({ groupId: row.groupId, ...checkpoint, reps: row.reps });
				}}
			/>
			compare
		</label>
	);
}

function outcomeCell(row: HistoryRow, choice: ArmChoice): React.JSX.Element {
	switch (row.kind) {
		case "run": {
			return runOutcomeCell(row);
		}
		case "session-attempt": {
			const recordedPassed =
				row.checks.state === "available"
					? row.status === "SUCCESSFUL"
					: undefined;
			return (
				<span className="flex flex-col items-start gap-2">
					{outcomeOf(sessionOutcome(row))}
					<SavedStateSummary
						assessment={row.savedState}
						recordedPassed={recordedPassed}
					/>
				</span>
			);
		}
		case "replay": {
			return outcomeOf(replayOutcome(row));
		}
		case "group": {
			return (
				<span className="flex flex-col gap-0.5">
					{outcome(groupOutcome(row))}
					<SessionGroupState row={row} />
					<CompareChoice row={row} choice={choice} />
				</span>
			);
		}
		default: {
			return row satisfies never;
		}
	}
}

function runOutcomeCell(row: RunHistoryRow): React.JSX.Element {
	if (row.progress.state === "running") {
		return (
			<span className="flex flex-col gap-0.5">
				{outcome({
					state: "running",
					phrase: runningPhrase(row.progress.stage, row.stageGrades),
					reason: `${row.progress.stage} · ${row.progress.stageState}`,
				})}
				<RunControls key={row.recordId} launchId={row.launchId} run={row.run} />
			</span>
		);
	}
	if (row.status === "AWAITING_HUMAN_REVIEW") {
		return (
			<span className="flex flex-col items-start gap-1">
				<StateBadge tone="neutral">Execution ended</StateBadge>
				{row.finalOutcome.state === "available" &&
				row.finalOutcome.status === "JUDGED" ? (
					<StateBadge
						tone={row.finalOutcome.verdict === "FAIL" ? "negative" : "positive"}
					>
						Final outcome {row.finalOutcome.verdict}
					</StateBadge>
				) : (
					<span className="text-12 text-dim">Final outcome unavailable</span>
				)}
				<StateBadge tone="attention">Human review pending</StateBadge>
				<details>
					<summary className="cursor-pointer text-14 text-dim">
						Recorded status
					</summary>
					<code className="select-all text-12">{row.status}</code>
				</details>
			</span>
		);
	}
	const reading = runPhrase(row);

	return reading === undefined
		? otherRunOutcome(row)
		: outcomeOf({ state: runStatusState(row.status), ...reading });
}

/** A finished run's phrase and reason; its glyph is the one run detail shows. */
type RunPhrase = Omit<OutcomePhrase, "state">;

function runPhrase(row: RunHistoryRow): RunPhrase | undefined {
	if (isStopped(row.status)) {
		return stoppedOutcome(row, stoppedStageOf(row.status));
	}

	switch (row.status) {
		case "COMPLETE": {
			return completedOutcome(row.stageGrades);
		}
		case "INTERRUPTED":
		case "FAILED": {
			return interruptedOutcome(row);
		}
		default: {
			return undefined;
		}
	}
}

/** A status the design gives no phrase, read as its state and raw status. */
function otherRunOutcome(row: RunHistoryRow): React.JSX.Element {
	return (
		<span className="flex flex-col gap-0.5">
			<Status state={runStatusState(row.status)} />
			<span className="font-mono text-12 text-dim">{row.status}</span>
			{row.status === "RUNNING" ? (
				<RunControls key={row.recordId} launchId={row.launchId} run={row.run} />
			) : null}
		</span>
	);
}

/** A record's status glyph with a phrase in place of its word, and why. */
interface OutcomePhrase {
	readonly state: StatusState;
	readonly tone?: StatusTone;
	readonly phrase: string;
	readonly reason: React.ReactNode;
}

function outcomeOf(reading: OutcomePhrase): React.JSX.Element {
	return <span className="flex flex-col gap-0.5">{outcome(reading)}</span>;
}

function outcome({
	state,
	phrase,
	reason,
	tone,
}: OutcomePhrase): React.JSX.Element {
	return (
		<>
			<span className="whitespace-nowrap">
				<Status state={state} label={phrase} tone={tone} />
			</span>
			<span className="text-12 text-dim">{reason}</span>
		</>
	);
}

/** Where a stage sits in its pipeline, counting from one. */
function stepOf(
	stage: string,
	stageGrades: StageGrades,
): { readonly step: number; readonly of: number } | undefined {
	if (stageGrades.state === "unavailable") {
		return undefined;
	}

	const index = stageGrades.grades.findIndex((each) => each.stage === stage);

	return index === -1
		? undefined
		: { step: index + 1, of: stageGrades.grades.length };
}

function runningPhrase(stage: string, stageGrades: StageGrades): string {
	const place = stepOf(stage, stageGrades);

	return place === undefined
		? "running"
		: `running · step ${String(place.step)} of ${String(place.of)}`;
}

/** A phrase that names a stage by its step number where the pipeline places it. */
function atStep(lead: string, stage: string, stageGrades: StageGrades): string {
	const place = stepOf(stage, stageGrades);

	return place === undefined
		? `${lead} ${stage}`
		: `${lead} step ${String(place.step)}`;
}

function gradeOf(
	stage: string,
	stageGrades: StageGrades,
): StageGrade | undefined {
	return stageGrades.state === "available"
		? stageGrades.grades.find((each) => each.stage === stage)?.grade
		: undefined;
}

function stoppedGrade(stage: string, grade: StageGrade | undefined): string {
	if (grade === undefined) {
		return stage;
	}
	if (grade.state === "unavailable") {
		return `${stage} · ${grade.reasons.join("; ")}`;
	}

	return `${stage} ${grade.letter}`;
}

function minimumReading(minimumGrade: RunHistoryRow["minimumGrade"]): string {
	return minimumGrade.state === "available"
		? `below minimum ${minimumGrade.letter}`
		: minimumGrade.reasons.join("; ");
}

/**
 * A stopped run names the step's recorded quality finding, with
 * that step's grade and the minimum it fell below, opening the step.
 */
function stoppedOutcome(row: RunHistoryRow, stage: string): RunPhrase {
	return {
		phrase: atStep("stopped at", stage, row.stageGrades),
		reason: (
			<a
				href={`/runs/${encodeURIComponent(row.run)}/stages/${encodeURIComponent(stage)}`}
				className="inline-flex items-start self-start text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover"
			>
				<span className="line-clamp-2 break-words">
					{stopReason(row, stage)}
				</span>
			</a>
		),
	};
}

/**
 * A stop record also ends a run the spend ceiling or a signal stopped, so
 * only a grade below the minimum reads as one; any other stop names the
 * cause its record keeps.
 */
function stopReason(row: RunHistoryRow, stage: string): string {
	const grade = gradeOf(stage, row.stageGrades);
	const fellBelow = grade?.state === "available" && !grade.reachesMinimum;
	if (
		!fellBelow &&
		row.finalOutcome.state === "available" &&
		row.finalOutcome.status === "NOT_REACHED"
	) {
		return `${stage} · ${row.finalOutcome.reason}`;
	}

	return `${stoppedGrade(stage, grade)} · ${minimumReading(row.minimumGrade)}`;
}

function completedOutcome(stageGrades: StageGrades): RunPhrase {
	if (stageGrades.state === "unavailable") {
		return {
			phrase: "completed",
			reason: stageGrades.reasons.join("; "),
		};
	}

	const steps = stageGrades.grades.length;
	const reached = stageGrades.grades.filter(
		({ grade }) => grade.state === "available" && grade.reachesMinimum,
	).length;

	return {
		phrase: `completed ${String(steps)} of ${String(steps)}`,
		reason:
			reached === steps
				? "all steps at or above minimum"
				: `${String(reached)} of ${String(steps)} steps graded at or above minimum`,
	};
}

/** An interrupted or failed run names the step it ended in and why, or the final judge's failure. */
function interruptedOutcome(row: RunHistoryRow): RunPhrase {
	const { finalOutcome } = row;
	if (finalOutcome.state === "unavailable") {
		return {
			phrase: "interrupted",
			reason: finalOutcome.reasons.join("; "),
		};
	}
	if (finalOutcome.status === "JUDGING_FAILED") {
		return {
			phrase: "final judge failed",
			reason: finalOutcome.reason,
		};
	}
	if (finalOutcome.status !== "NOT_REACHED") {
		return { phrase: "interrupted", reason: row.status };
	}

	const { stage, reason } = finalOutcome;
	if (stage === undefined) {
		return { phrase: "interrupted", reason };
	}

	return {
		phrase: atStep("interrupted at", stage, row.stageGrades),
		reason: `${stage} · ${reason}`,
	};
}

/** A replay's verdict judges one step; it does not stop a pipeline. */
function replayOutcome(row: ReplayRow): OutcomePhrase {
	return {
		state: row.status === "CONTINUE" ? "accepted" : "stopped",
		tone: row.status === "CONTINUE" ? "positive" : "attention",
		phrase: `verdict ${row.status}`,
		reason:
			row.attempt === undefined
				? "attempt position not recorded"
				: `${attemptLabel(row.attempt)} at this checkpoint`,
	};
}

/**
 * A group row is written only once the group finishes, so a shortfall in
 * its recorded reps is a group cut short, never one still running.
 */
function groupOutcome(row: GroupRow): OutcomePhrase {
	const recorded = recordedReps(row);
	const unread = row.unreadReps.map(
		({ repId, reason }) => `${repId}: ${reason}`,
	);

	return {
		state: recorded === row.reps ? "accepted" : "interrupted",
		phrase: `${String(recorded)} of ${String(row.reps)} recorded`,
		reason: [
			`${String(row.successful)} recorded successful${row.mode === "session" ? " on reply/transcript checks" : ""}`,
			...unread,
		].join(" · "),
	};
}

const SESSION_OUTCOMES = {
	SUCCESSFUL: {
		state: "accepted",
		tone: "positive",
		phrase: "recorded successful",
	},
	UNSUCCESSFUL: {
		state: "stopped",
		tone: "negative",
		phrase: "recorded unsuccessful",
	},
	NO_REPLY: { state: "interrupted", tone: "attention", phrase: "no reply" },
	EXECUTION_FAILED: {
		state: "interrupted",
		tone: "attention",
		phrase: "failed to run",
	},
} as const satisfies Record<
	SessionAttemptRow["status"],
	{
		readonly state: StatusState;
		readonly tone: StatusTone;
		readonly phrase: string;
	}
>;

function sessionOutcome(row: SessionAttemptRow): OutcomePhrase {
	const { checks } = row;
	if (checks.state === "unavailable") {
		return {
			...SESSION_OUTCOMES[row.status],
			reason: checks.reasons.join("; "),
		};
	}

	const failed = checks.declared - checks.passed;

	return {
		...SESSION_OUTCOMES[row.status],
		reason:
			failed === 0
				? "all reply/transcript checks passed"
				: `${String(failed)} of ${plural(checks.declared, "reply/transcript check")} failed`,
	};
}

/**
 * What a run in flight has spent. Its own running total where its events
 * carry one, or else the latest event's figure with the words the server
 * sends for what it covers, since that figure is not the run's total: each
 * event kind scopes it differently, and one scoped to a single stage falls
 * when the next stage starts.
 */
function runningCost(progress: RunningProgress): React.JSX.Element {
	const { runSpentUsd, spentUsd, spendScope } = progress;

	return (
		<span className="flex flex-col gap-0.5">
			{figure(spendReading(runSpentUsd ?? spentUsd))}
			{reasonsLine([runSpentUsd === undefined ? spendScope : "so far"])}
		</span>
	);
}

type RowStaleness = HistoryRow["staleness"];
type JudgedStaleness = Extract<RowStaleness, { readonly state: "available" }>;

function causeList(causes: readonly string[]): readonly React.JSX.Element[] {
	return causes.map((cause, index) => (
		<span key={index} className="text-12 text-dim">
			{cause}
		</span>
	));
}

/**
 * The key of a Disclosure in the row's cells. TableShell keys its rows by
 * index, so filtering the table hands a row's cells to whatever Disclosure the
 * previous row left mounted there, with its open state intact. Keying by the
 * row makes React remount it instead.
 */
function disclosureKeyOf(row: HistoryRow): string {
	return `${row.kind}:${recordIdentity(row)}`;
}

function causesFor(
	row: HistoryRow,
	causes: readonly string[],
): React.ReactNode {
	if (causes.length <= 1) {
		return causeList(causes);
	}

	return (
		<Disclosure
			key={disclosureKeyOf(row)}
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
				<span className="font-mono text-14 text-secondary-foreground">
					{corpusVersionLabel(row.corpusVersion.digest)}
				</span>
			) : (
				<span className="text-12 text-muted-foreground">
					{corpusMeasurementReading(row.corpusVersion)}
				</span>
			)}
			{row.kind === "run" && row.corpusChangedDuringRun ? (
				<span className="text-12 text-secondary-foreground">
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
			<span className="text-12 text-muted-foreground">
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

	if (isClean(staleness)) {
		return (
			<span className="text-12 text-muted-foreground">
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
			<span className="text-12 text-secondary-foreground">
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
			<span className="text-12 text-secondary-foreground">
				<Status state="superseded" /> · {distance.versions} versions back
			</span>
		);
	}
	if (staleness.stale) {
		return (
			<span className="text-12 text-secondary-foreground">
				<Status state="stale" />
			</span>
		);
	}

	return (
		<span className="text-12 text-muted-foreground">
			<Status state="clear" />
		</span>
	);
}

const NOT_APPLICABLE = "n/a";
const STEP_REPLAY_ONLY = "step replay only";

type StageGrades = RunHistoryRow["stageGrades"];
type StageGrade = Extract<
	StageGrades,
	{ readonly state: "available" }
>["grades"][number]["grade"];
type ReplayRow = Extract<HistoryRow, { readonly kind: "replay" }>;
type PipelineStages = ReplayRow["pipelineStages"];

/**
 * The dim line beneath a figure: the reasons a record cannot supply it, or
 * what a figure it does supply covers and lacks.
 */
function reasonsLine(reasons: readonly string[]): React.JSX.Element {
	return <span className="text-12 text-dim">{reasons.join("; ")}</span>;
}

function StepGradeReadings({
	readings,
}: {
	readonly readings: readonly {
		readonly stage: string;
		readonly value: string;
		readonly measured: boolean;
		readonly reason?: string | undefined;
	}[];
}): React.JSX.Element {
	return (
		<dl className="flex flex-col gap-2">
			{readings.map(({ stage, value, measured, reason }) => (
				<div
					key={stage}
					className="flex min-w-0 items-baseline justify-between gap-2"
				>
					<dt className="min-w-0 text-12 wrap-anywhere text-secondary-foreground">
						{stage}
					</dt>
					<dd
						title={reason}
						className={
							measured
								? "rounded-sm border border-divider bg-raised px-2 py-0.5 font-mono text-14 font-medium"
								: "max-w-24 text-right text-12 text-dim"
						}
					>
						{value}
					</dd>
				</div>
			))}
		</dl>
	);
}

function runStepGrades(stageGrades: StageGrades): React.JSX.Element {
	if (stageGrades.state === "unavailable") {
		return reasonsLine(stageGrades.reasons);
	}

	const readings = stageGrades.grades.map(({ stage, status, grade }) => {
		if (grade.state === "available") {
			return { stage, value: grade.letter, measured: true, reason: undefined };
		}

		let value = "No grade";
		if (status === "not-run") {
			value = "Not run";
		} else if (status === "awaiting-judgment") {
			value = "Awaiting judge";
		}

		return { stage, value, measured: false, reason: grade.reasons.join("; ") };
	});

	return <StepGradeReadings readings={readings} />;
}

function gradeTokens(text: string): React.JSX.Element {
	return (
		<span className="font-mono text-12 tracking-caps whitespace-normal">
			{text}
		</span>
	);
}

function placedGrades(
	stages: PipelineStages,
	tokens: ReadonlyMap<string, string | undefined>,
	absent: string,
): React.JSX.Element {
	const names =
		stages.state === "available" ? stages.stages : [...tokens.keys()];
	const readings = names.map((stage) => {
		const value = tokens.get(stage);
		const missing = tokens.has(stage) ? "No grade" : absent;

		return { stage, value: value ?? missing, measured: value !== undefined };
	});

	return (
		<span className="flex flex-col gap-2">
			<StepGradeReadings readings={readings} />
			{stages.state === "unavailable" ? reasonsLine(stages.reasons) : null}
		</span>
	);
}

function groupMedians(row: GroupRow): ReadonlyMap<string, string | undefined> {
	return new Map(
		row.stageSummaries.map(({ stage, graded, grades }) => [
			stage,
			grades.state === "available"
				? `${grades.median} · ${String(graded)} graded`
				: undefined,
		]),
	);
}

/** How many of the group's reps left a readable record. */
function recordedReps(row: GroupRow): number {
	return Object.values(row.finalOutcomes).reduce(
		(sum, count) => sum + count,
		0,
	);
}

/**
 * A session group is graded by its reps' checks, so its grade is the count
 * passed among the reps it recorded, naming the reps it could not count.
 */
function groupStepGrades(row: GroupRow): React.JSX.Element {
	if (row.mode === "session") {
		const recorded = recordedReps(row);
		const passed = (
			<span className="flex flex-col gap-1">
				<span className="text-12 text-muted-foreground">
					Reply/transcript basis
				</span>
				{gradeTokens(
					`${String(row.successful)}/${String(recorded)} recorded successful`,
				)}
			</span>
		);
		if (recorded === row.reps) {
			return passed;
		}

		return (
			<span className="flex flex-col gap-0.5">
				{passed}
				{reasonsLine([
					`${String(row.reps - recorded)} of ${plural(row.reps, "rep")} not recorded`,
				])}
			</span>
		);
	}

	return (
		<span className="flex flex-col gap-2">
			<span className="text-12 text-muted-foreground">Median grades</span>
			{placedGrades(
				row.pipelineStages,
				groupMedians(row),
				row.mode === "stage" ? "Not included" : "No grade",
			)}
		</span>
	);
}

function SessionGroupState({
	row,
}: {
	readonly row: GroupRow;
}): React.JSX.Element | null {
	if (row.mode !== "session") {
		return null;
	}
	const state = row.savedState;
	if (state === undefined) {
		return (
			<span className="text-12 text-muted-foreground">
				Saved state unavailable
			</span>
		);
	}
	let tone: "positive" | "negative" | "attention" = "positive";
	if (state.unavailable > 0) {
		tone = "attention";
	}
	if (state.failed > 0) {
		tone = "negative";
	}
	return (
		<span className="mt-2 flex flex-col items-start gap-1">
			{state.assessed === 0 ? (
				<span className="text-12 text-muted-foreground">
					Saved state unavailable
				</span>
			) : (
				<StateBadge tone={tone}>
					Saved state: {state.passed} of {state.assessed} assessed attempts
					passed
				</StateBadge>
			)}
			<span className="text-12 text-muted-foreground">
				{state.failed} failed · {state.unavailable} of {state.total} unavailable
			</span>
			{state.disagreements > 0 ? (
				<StateBadge tone="attention">
					Assessment layers disagree in {plural(state.disagreements, "attempt")}
				</StateBadge>
			) : null}
			{state.unavailableReps.length > 0 ? (
				<Disclosure
					key={disclosureKeyOf(row)}
					collapsedLabel="Saved state coverage"
					expandedLabel="Hide saved state coverage"
				>
					<ul className="text-12 text-muted-foreground">
						{state.unavailableReps.map(({ repId, reason }) => (
							<li key={repId} className="py-1 wrap-anywhere">
								{repId}: {reason}
							</li>
						))}
					</ul>
				</Disclosure>
			) : null}
		</span>
	);
}

type SessionAttemptRow = Extract<
	HistoryRow,
	{ readonly kind: "session-attempt" }
>;

/**
 * A session attempt is graded by its checks, so its grade is the count
 * passed, or its outcome where its session left nothing to check.
 */
function sessionStepGrades(row: SessionAttemptRow): React.JSX.Element {
	const { checks } = row;
	if (checks.state === "unavailable") {
		return (
			<span className="flex flex-col gap-0.5">
				<span className="font-mono text-12 text-dim">{row.status}</span>
				{reasonsLine(checks.reasons)}
			</span>
		);
	}

	return gradeTokens(
		`${String(checks.passed)} of ${plural(checks.declared, "reply/transcript check")} passed`,
	);
}

function stepGradesCell(row: HistoryRow): React.JSX.Element {
	switch (row.kind) {
		case "run": {
			return runStepGrades(row.stageGrades);
		}
		case "replay": {
			return placedGrades(
				row.pipelineStages,
				new Map([[row.stage, row.grade]]),
				"Not replayed",
			);
		}
		case "group": {
			return groupStepGrades(row);
		}
		case "session-attempt": {
			return sessionStepGrades(row);
		}
		default: {
			return row satisfies never;
		}
	}
}

/** A task grade's value, with what it means or why it is missing beneath. */
function taskGrade(
	row: HistoryRow,
	{ value, note }: OutcomeReading,
): React.JSX.Element {
	return (
		<span className="flex flex-col gap-0.5">
			<span className="font-mono text-14 font-bold">{value}</span>
			<Disclosure
				key={disclosureKeyOf(row)}
				collapsedLabel={note === JUDGED_NOTE ? "independent" : "details"}
				expandedLabel="hide"
			>
				<span className="max-w-note text-12 text-dim">{note}</span>
			</Disclosure>
		</span>
	);
}

function runTaskGrade(
	finalOutcome: RunHistoryRow["finalOutcome"],
): OutcomeReading {
	if (finalOutcome.state === "unavailable") {
		return { value: NOT_RETURNED, note: finalOutcome.reasons.join("; ") };
	}

	return outcomeReading(finalOutcome);
}

/**
 * Only a pipeline group's reps reach the final judge, so only its task grade
 * counts their verdicts, over the reps the judge graded, naming the reps it
 * did not.
 */
function groupTaskGrade(row: GroupRow): OutcomeReading {
	switch (row.mode) {
		case "pipeline": {
			const passed = row.finalOutcomes["PASS"] ?? 0;
			const judged = passed + (row.finalOutcomes["FAIL"] ?? 0);
			const unjudged = `${String(row.reps - judged)} of ${plural(row.reps, "rep")} not judged`;
			if (judged === 0) {
				return { value: NOT_RETURNED, note: `not reached · ${unjudged}` };
			}

			return {
				value: `${String(passed)} of ${String(judged)} PASS`,
				note:
					judged === row.reps ? JUDGED_NOTE : `${JUDGED_NOTE} · ${unjudged}`,
			};
		}
		case "stage": {
			return { value: NOT_APPLICABLE, note: STEP_REPLAY_ONLY };
		}
		case "session": {
			return { value: NOT_APPLICABLE, note: SESSION_GRADE_REASON };
		}
		default: {
			return row.mode satisfies never;
		}
	}
}

function taskGradeCell(row: HistoryRow): React.JSX.Element {
	switch (row.kind) {
		case "run": {
			return taskGrade(row, runTaskGrade(row.finalOutcome));
		}
		case "replay": {
			return taskGrade(row, { value: NOT_APPLICABLE, note: STEP_REPLAY_ONLY });
		}
		case "group": {
			return taskGrade(row, groupTaskGrade(row));
		}
		case "session-attempt": {
			return taskGrade(row, {
				value: NOT_APPLICABLE,
				note: SESSION_GRADE_REASON,
			});
		}
		default: {
			return row satisfies never;
		}
	}
}

const UNRECORDED = "unrecorded";

/**
 * A figure a record does not hold, saying so rather than blank. Why is long
 * and repeats down the table, so it opens on request.
 */
function unrecorded(
	row: HistoryRow,
	reasons: readonly string[],
): React.JSX.Element {
	return (
		<span className="flex flex-col items-end gap-0.5">
			<span className="min-h-12 text-12 text-dim">{UNRECORDED}</span>
			<Disclosure
				key={disclosureKeyOf(row)}
				align="end"
				collapsedLabel="why"
				expandedLabel="hide"
			>
				{causeList(reasons)}
			</Disclosure>
		</span>
	);
}

function figure(text: string): React.JSX.Element {
	return <span className="font-mono text-12">{text}</span>;
}

/**
 * A sum that lacks a part is labelled partial and names each part it lacks,
 * so it is never read as the whole spend. Why each is missing is long and
 * repeats down the table, so it opens on request.
 */
function recordedCost(row: HistoryRow): React.JSX.Element {
	const { cost } = row;
	if (cost.state === "unavailable") {
		return unrecorded(row, cost.reasons);
	}
	if (cost.missing.length === 0) {
		return figure(spendReading(cost.usd));
	}

	return (
		<span className="flex flex-col items-end gap-0.5">
			<span className="flex min-h-12 flex-col items-end gap-0.5">
				{figure(spendReading(cost.usd))}
				<span className="text-12 text-dim">partial</span>
			</span>
			<Disclosure
				key={disclosureKeyOf(row)}
				align="end"
				collapsedLabel="why"
				expandedLabel="hide"
			>
				{causeList(
					cost.missing.map(({ part, reason }) => `${part}: ${reason}`),
				)}
			</Disclosure>
		</span>
	);
}

function costCell(row: HistoryRow): React.JSX.Element {
	if (row.kind === "run" && row.progress.state === "running") {
		return runningCost(row.progress);
	}

	return recordedCost(row);
}

/** A run in flight's wall time moves with the clock between its events. */
function wallCell(row: HistoryRow, nowMs: number): React.JSX.Element {
	if (row.kind === "run" && row.progress.state === "running") {
		const { elapsedMs, measuredAt } = row.progress;

		return figure(clockReading(liveElapsedMs(elapsedMs, measuredAt, nowMs)));
	}

	return recordedWall(row);
}

function recordedWall(row: HistoryRow): React.JSX.Element {
	const { wallTime } = row;
	if (wallTime.state === "unavailable") {
		return unrecorded(row, wallTime.reasons);
	}

	return figure(clockReading(wallTime.ms));
}

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
const SORT_OPTIONS = [
	["newest", "Newest first"],
	["oldest", "Oldest first"],
	["cost", "Highest cost"],
	["case", "Case A–Z"],
] as const;

function FilterBar({
	discovery,
	total,
	onChange,
	invalidated,
	onClear,
}: {
	readonly discovery: RunDiscoverySearch;
	readonly total: number | undefined;
	readonly onChange: (search: RunDiscoverySearch) => void;
	readonly invalidated: boolean;
	readonly onClear: () => void;
}): React.JSX.Element {
	const [filtersOpen, setFiltersOpen] = useState(false);
	const filtersId = useId();
	const activeFilters =
		[discovery.status, discovery.kind, discovery.corpus].filter(
			(value) => value !== undefined && value !== "all",
		).length + Number(invalidated);

	return (
		<div className="flex flex-col gap-4 border-b border-divider page-gutter py-5">
			<div className="flex flex-wrap items-center gap-3">
				<label className="min-w-0 w-full flex-none sm:w-auto sm:flex-1">
					<SearchInput
						value={discovery.query ?? ""}
						aria-label="Search runs"
						placeholder="run id, case, corpus hash, blocker id"
						onChange={(event) => {
							onChange({ query: event.target.value });
						}}
					/>
				</label>
				<div className="flex w-full items-center gap-3 sm:w-auto">
					<div className="min-w-0 flex-1 sm:w-66 sm:flex-none">
						<NativeSelect
							prefix="Sort"
							aria-label="Sort runs"
							value={discovery.sort ?? "newest"}
							onChange={(event) => {
								const sort = SORT_OPTIONS.find(
									([value]) => value === event.target.value,
								)?.[0];
								onChange({ sort });
							}}
						>
							{SORT_OPTIONS.map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</NativeSelect>
					</div>
					<Button variant="outline" onClick={onClear}>
						<RotateCcw aria-hidden="true" className="size-4" />
						Clear
					</Button>
				</div>
			</div>
			{discovery.sort === "cost" ? (
				<p className="text-12 text-muted-foreground">
					Cost sorting uses complete reported amounts; partial and missing costs
					come last.
				</p>
			) : null}
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
					{activeFilters === 0 ? "" : ` · ${activeFilters} active`}
				</Button>
			</div>
			<div
				id={filtersId}
				className={`${filtersOpen ? "flex" : "hidden"} flex-col gap-4 sm:flex`}
			>
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
			</div>
		</div>
	);
}

function launchAttemptsLine(launch: LaunchRow): string {
	if (launch.target === "analysis") {
		return "one call";
	}

	return launch.attempts === 1
		? "one run"
		: `group · ${String(launch.attempts)} attempts`;
}

function launchTarget(launch: LaunchRow): string {
	const checkpoint = `${launch.stage ?? ""} · ${launch.run ?? ""}`;
	switch (launch.target) {
		case "case": {
			return launch.caseId ?? "";
		}
		case "replay": {
			return `replay ${checkpoint}`;
		}
		case "comparison": {
			return `compare attempts at ${checkpoint}`;
		}
		case "extension": {
			return `add attempts to a comparison at ${checkpoint}`;
		}
		case "analysis": {
			return `root-cause analysis of ${launch.run ?? ""}`;
		}
		default: {
			return launch.target satisfies never;
		}
	}
}

/**
 * A launch the browser started, listed until its first record replaces it,
 * or for good once the operator stopped one that leaves no record. It has no
 * record, so it has no id, grade or corpus judgment to show.
 */
function launchCells(
	launch: LaunchRow,
	nowMs: number,
): readonly React.JSX.Element[] {
	const target = launchTarget(launch);
	const instant = recordedInstant(launch.launchedAt);

	return [
		<span key="run" className="font-mono text-14">
			{`launch ${launch.id.slice(0, 8)}`}
		</span>,
		<span key="case" className="flex flex-col items-start gap-0.5">
			<span className="font-mono text-14">{target}</span>
			<span className="text-12 text-dim">{launchAttemptsLine(launch)}</span>
		</span>,
		<span key="outcome" className="flex flex-col gap-0.5">
			<Status state={runStatusState(launch.status)} />
			{launch.status === "RUNNING" ? (
				<>
					<span className="text-12 text-dim">started from the browser</span>
					{/* An analysis is one capped call the server refuses to stop. */}
					{launch.target === "analysis" ? undefined : (
						<RunControls key={launch.id} launchId={launch.id} run={undefined} />
					)}
				</>
			) : (
				<span className="text-12 text-dim">stopped by the operator</span>
			)}
		</span>,
		<span key="started" className="text-12 text-muted-foreground">
			{instant === undefined ? (
				"Time not recorded"
			) : (
				<time dateTime={launch.launchedAt} title={launch.launchedAt}>
					{recordMoment(instant, nowMs)}
				</time>
			)}
		</span>,
	];
}

function newestLaunches(launches: readonly LaunchRow[]): readonly LaunchRow[] {
	return launches.toSorted((left, right) => {
		const leftTime = recordedInstant(left.launchedAt);
		const rightTime = recordedInstant(right.launchedAt);
		if (leftTime === undefined) {
			return rightTime === undefined ? 0 : 1;
		}
		if (rightTime === undefined) {
			return -1;
		}
		return rightTime - leftTime;
	});
}

function LaunchQueue({
	launches,
	nowMs,
}: {
	readonly launches: readonly LaunchRow[];
	readonly nowMs: number;
}): React.JSX.Element | null {
	if (launches.length === 0) {
		return null;
	}
	return (
		<SummaryPanel
			title="Active launches"
			description="Browser processes still in flight. Execution state is separate from recorded quality outcomes."
		>
			<div className="overflow-x-auto">
				<TableShell
					caption="Active launch queue"
					columns={["Launch", "Target", "Execution", "Started"]}
					rows={newestLaunches(launches).map((launch) =>
						launchCells(launch, nowMs),
					)}
				/>
			</div>
		</SummaryPanel>
	);
}

function EndedLaunches({
	launches,
	nowMs,
}: {
	readonly launches: readonly LaunchRow[];
	readonly nowMs: number;
}): React.JSX.Element | null {
	if (launches.length === 0) {
		return null;
	}
	return (
		<div className="rounded-lg border border-divider bg-card p-4">
			<Disclosure
				collapsedLabel={`Ended launch history (${String(launches.length)})`}
				expandedLabel="Hide ended launch history"
			>
				<p className="my-2 text-14 text-muted-foreground">
					These launch records have ended. They carry no recorded quality
					outcome.
				</p>
				<div className="w-full overflow-x-auto">
					<TableShell
						caption="Ended launches"
						columns={["Launch", "Target", "Execution", "Started"]}
						rows={newestLaunches(launches).map((launch) =>
							launchCells(launch, nowMs),
						)}
					/>
				</div>
			</Disclosure>
		</div>
	);
}

/**
 * The arms chosen so far: arm A is the first, so the dialog it opens runs
 * the baseline from arm A's corpus without the skill arm B differs in.
 */
function ComparisonBar({
	chosen,
	onClear,
}: {
	readonly chosen: readonly ChosenArm[];
	readonly onClear: () => void;
}): React.JSX.Element | null {
	const [armA, armB] = chosen;
	if (armA === undefined) {
		return null;
	}

	return (
		<div className="flex flex-wrap items-center gap-3 text-14">
			<span className="font-mono">{`Baseline (before) ${armA.groupId}`}</span>
			{armB === undefined ? (
				<span className="text-dim">{`Choose candidate (after), a group replayed at ${armA.stage} · ${armA.run}`}</span>
			) : (
				<>
					<span className="font-mono">{`Candidate (after) ${armB.groupId}`}</span>
					<LaunchDialog
						target={{
							kind: "comparison",
							armA: armA.groupId,
							armB: armB.groupId,
							run: armA.run,
							stage: armA.stage,
							reps: armA.reps,
						}}
						triggerLabel="Compare these attempts"
					/>
				</>
			)}
			<Button variant="outline" size="sm" onClick={onClear}>
				Clear
			</Button>
		</div>
	);
}

/**
 * Says setup is done only on the stored settings' word, since the live
 * install is always a linked corpus but the ceiling may never have been set.
 */
function SetupAccount(): React.JSX.Element | null {
	const settings = useQuery(launchSettingsQuery);
	if (settings.isError) {
		return (
			<p role="alert">
				<span aria-hidden="true">⚠ </span>
				{`Could not read the stored spend limit: ${settings.error.message}`}
			</p>
		);
	}
	if (settings.data === undefined || settings.data.spendCeilingUsd === null) {
		return null;
	}

	return <p>The corpus is linked and a spend limit is set.</p>;
}

/**
 * Why the table is empty: no record yet, or records the filter and search
 * hide. Unreadable records alone leave it to their notice to say.
 */
function NothingListed({
	listable,
	unreadable,
}: {
	readonly listable: boolean;
	readonly unreadable: boolean;
}): React.JSX.Element | null {
	if (listable) {
		return (
			<p className="text-muted-foreground">
				No record matches this filter and search.
			</p>
		);
	}
	if (unreadable) {
		return null;
	}

	return (
		<EmptyState heading="No runs recorded">
			<SetupAccount />
			<p>
				Declare a case, then run it. Every attempt lands here as a durable
				record.
			</p>
			<Button asChild>
				<Link to="/cases">Declare a case</Link>
			</Button>
		</EmptyState>
	);
}

/**
 * The ones the last edit invalidated and the search lets through when the
 * address names that edit, otherwise those the selected filter and the search
 * both let through.
 */
function listedRecords(
	selection: InvalidatedSelection | undefined,
	records: Pick<RunHistoryResponse, "rows" | "launches">,
	discovery: RunDiscoverySearch,
): Pick<RunHistoryResponse, "rows" | "launches"> {
	if (selection !== undefined) {
		return {
			rows: sortDiscoveredRows(
				(selection.kind === "listed" ? selection.rows : []).filter((row) =>
					matchesDiscovery(row, discovery),
				),
				discovery.sort,
			),
			launches: [],
		};
	}

	return {
		rows: sortDiscoveredRows(
			records.rows.filter((row) => matchesDiscovery(row, discovery)),
			discovery.sort,
		),
		launches: records.launches.filter((launch) =>
			launchMatchesDiscovery(launch, discovery),
		),
	};
}

/**
 * Whether the page says nothing is listed. An invalidated selection names why
 * it lists none itself, so it says so only when the search hid every row the
 * selection listed.
 */
function saysNothingListed(
	selection: InvalidatedSelection | undefined,
	listed: Pick<RunHistoryResponse, "rows" | "launches">,
): boolean {
	const selectionSaysWhy =
		selection !== undefined &&
		(selection.kind !== "listed" || selection.rows.length === 0);

	return (
		!selectionSaysWhy &&
		listed.rows.length === 0 &&
		listed.launches.length === 0
	);
}

/**
 * Replays a step of a recorded run, chosen in the dialog. Until the history
 * reads there is nothing to choose from, and a failed poll after it read keeps
 * the last offer so an open dialog stays open, and a history with no replayable
 * step says so beside the action, since a disabled button explains nothing.
 */
function ReplayAStep({
	offer,
}: {
	readonly offer: ReplayOffer | undefined;
}): React.JSX.Element {
	if (offer?.state !== "available") {
		return (
			<>
				{offer === undefined ? null : (
					<span className="text-12 text-dim">{offer.reason}</span>
				)}
				<Button variant="outline" disabled>
					Replay a step
					<KeyHint letter="r" />
				</Button>
			</>
		);
	}

	return (
		<LaunchDialog
			target={{
				kind: "chosen-replay",
				runs: offer.runs,
				opensOn: offer.opensOn,
			}}
			triggerLabel="Replay a step"
			shortcut="r"
		/>
	);
}

/** That the history is still loading, or that it could not load. */
function LoadState({
	loading,
	failed,
}: {
	readonly loading: boolean;
	readonly failed: boolean;
}): React.JSX.Element | null {
	if (loading) {
		return <p className="text-muted-foreground">Loading…</p>;
	}
	if (failed) {
		return (
			<p role="alert" className="text-attention">
				<span aria-hidden="true">⚠ </span>
				Could not load run history.
			</p>
		);
	}

	return null;
}

function waitsForCorpusFilter(
	pending: boolean,
	corpus: RunDiscoverySearch["corpus"],
): boolean {
	return pending && corpus !== undefined && corpus !== "all";
}

export function RunHistoryPage({
	invalidatedBy,
	discovery,
}: {
	readonly invalidatedBy: string | undefined;
	readonly discovery: RunDiscoverySearch;
}): React.JSX.Element {
	const navigate = useNavigate();
	useRememberRunsSearch(discovery);
	function changeDiscovery(next: RunDiscoverySearch): void {
		const leavesInvalidated =
			next.status !== undefined ||
			next.kind !== undefined ||
			next.corpus !== undefined;
		void navigate({
			to: "/",
			search: (previous: RunDiscoverySearch) => ({
				...previous,
				...next,
				invalidatedBy: leavesInvalidated ? undefined : invalidatedBy,
			}),
			replace: true,
		});
	}
	const [chosen, setChosen] = useState<readonly ChosenArm[]>([]);
	const choice: ArmChoice = {
		chosen,
		onToggle: (arm) => {
			setChosen((current) =>
				current.some(({ groupId }) => groupId === arm.groupId)
					? current.filter(({ groupId }) => groupId !== arm.groupId)
					: [...current, arm],
			);
		},
	};
	const query = useRunHistory();
	const selection = useInvalidatedSelection(invalidatedBy, readOf(query));

	const unreadable = query.data?.unreadable ?? [];
	const recorded = query.data?.rows ?? [];
	const allLaunches = query.data?.launches ?? [];
	const history = { rows: recorded, launches: allLaunches };
	const { rows, launches } = listedRecords(selection, history, discovery);
	const activeLaunches = launches.filter(
		(launch) => launch.status === "RUNNING",
	);
	const endedLaunches = launches.filter(
		(launch) => launch.status !== "RUNNING",
	);
	const listable = listedEntryCount(history) > 0;
	const waitingForFilter = waitsForCorpusFilter(
		query.freshnessPending,
		discovery.corpus,
	);
	const nothingListed =
		query.isSuccess &&
		!waitingForFilter &&
		saysNothingListed(selection, { rows, launches });
	const nowMs = useNow(
		pipelineRuns(recorded).some((row) => row.progress.state === "running"),
	);

	return (
		<div>
			<ScreenHeader
				title="Runs"
				subline={
					query.isSuccess
						? `${plural(listedEntryCount(history), "readable entry", "readable entries")} · ${plural(recorded.length, "record")} · ${plural(allLaunches.length, "launch", "launches")}`
						: undefined
				}
				aside={
					<span className="flex flex-wrap items-center justify-end gap-2">
						<ReplayAStep
							offer={
								query.data === undefined ? undefined : replayOffer(recorded)
							}
						/>
						<LaunchDialog
							target={{ kind: "case" }}
							triggerLabel="New run"
							shortcut="n"
						/>
					</span>
				}
			/>

			<FilterBar
				discovery={discovery}
				total={
					query.data === undefined ? undefined : listedEntryCount(query.data)
				}
				onChange={changeDiscovery}
				invalidated={selection !== undefined}
				onClear={() => {
					void navigate({ to: "/", search: {}, replace: true });
				}}
			/>

			<div className="flex flex-col gap-5 page-gutter pt-6 pb-12">
				<LoadState
					loading={query.isLoading || waitingForFilter}
					failed={query.isError}
				/>
				{query.data === undefined ? null : (
					<p
						role="status"
						className="text-12 text-muted-foreground"
					>{`${String(listedEntryCount({ rows, launches }))} of ${String(listedEntryCount(history))} readable entries match · ${plural(rows.length, "record")} · ${plural(activeLaunches.length, "active launch", "active launches")} · ${plural(endedLaunches.length, "ended launch", "ended launches")}`}</p>
				)}

				{selection === undefined ? null : (
					<InvalidatedNotice selection={selection} />
				)}

				{unreadable.length > 0 ? (
					<UnreadableRecords records={unreadable} />
				) : null}

				{nothingListed ? (
					<NothingListed
						listable={listable}
						unreadable={unreadable.length > 0}
					/>
				) : null}

				<LaunchQueue launches={activeLaunches} nowMs={nowMs} />
				{rows.length === 0 && launches.length > 0 ? (
					<p className="text-14 text-muted-foreground">
						No saved run records in this selection.
					</p>
				) : null}
				{rows.length > 0 ? (
					<>
						<ComparisonBar
							chosen={chosen}
							onClear={() => {
								setChosen([]);
							}}
						/>
						<TableShell
							caption="Run history"
							className="min-w-320 table-fixed"
							columnClasses={[
								"w-28",
								"w-44",
								"w-56",
								"w-60",
								"w-40",
								"w-48",
								"w-32",
								"w-32",
							]}
							columns={[...COLUMNS]}
							numeric={[...NUMERIC_COLUMNS]}
							rows={rows.map((row) => [
								<span key="run">{runCell(row, nowMs)}</span>,
								<span key="case">{caseCell(row)}</span>,
								outcomeCell(row, choice),
								stepGradesCell(row),
								taskGradeCell(row),
								corpusCell(row),
								costCell(row),
								wallCell(row, nowMs),
							])}
						/>
					</>
				) : null}
				<EndedLaunches launches={endedLaunches} nowMs={nowMs} />
				<Disclosure
					collapsedLabel="How filters and counts work"
					expandedLabel="Hide filter definitions"
				>
					<p className="max-w-prose text-14 text-muted-foreground">
						Counts include readable run records and browser launch records.
						Launch history stays accessible separately. Ended means execution
						ended; Stopped means a workflow stopped at a step. Passed and Failed
						require a recorded quality outcome. Current corpus requires a
						measured unchanged corpus. Stale records retain their recorded
						grades after the corpus changes. Date sorting keeps unknown dates
						after timed records.
					</p>
				</Disclosure>
			</div>
		</div>
	);
}
