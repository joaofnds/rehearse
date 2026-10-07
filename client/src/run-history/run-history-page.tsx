import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { Disclosure } from "#client/system/components/disclosure";
import { EmptyState } from "#client/system/components/empty-state";
import { FilterPill } from "#client/system/components/filter-pill";
import { Status } from "#client/system/components/status";
import type { StatusState } from "#client/system/components/status";
import { TableShell } from "#client/system/components/table-shell";
import { Button } from "#client/system/ui/button";
import { clockReading, liveElapsedMs, spendReading } from "./run-progress";
import type { RunHistoryResponse } from "./run-history-query";
import { polledRunHistoryQuery } from "./run-history-polling";
import { useNow } from "./use-now";
import { runStatusState } from "./run-status";
import {
	CORPUS_VERSION_LABEL,
	corpusMeasurementReading,
	corpusVersionLabel,
} from "#benchmark/corpus-version-label";
import { isStopped, stoppedStageOf } from "#benchmark/stopped-status";
import { attemptLabel } from "#client/attempt-label";
import { plural } from "#client/plural";
import { ScreenHeader } from "#client/system/components/screen-header";
import { SectionLabel } from "#client/system/components/section-label";
import { Notice } from "#client/system/components/notice";
import { LaunchDialog } from "#client/launch/launch-dialog";
import {
	JUDGED_NOTE,
	NOT_RETURNED,
	outcomeReading,
} from "#client/run-detail/task-grade-card";
import type { OutcomeReading } from "#client/run-detail/task-grade-card";
import { SESSION_GRADE_REASON } from "#server/session-grade-reason";
import { RunControls } from "./run-controls";

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
	"Task grade",
	"Corpus",
	"Cost",
	"Wall",
] as const;

const NUMERIC_COLUMNS = ["Cost", "Wall"] as const;

const FILTERS = [
	"All",
	"Running",
	"Stopped",
	"Replays",
	"Groups",
	"Clean corpus only",
] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Stopped names a pipeline run whose stage fell below the minimum. A replay's
 * STOP verdict grades one stage in isolation and stops nothing, so it does not
 * match.
 */
function matchesFilter(row: HistoryRow, filter: Filter): boolean {
	switch (filter) {
		case "All": {
			return true;
		}
		case "Running": {
			return row.kind === "run" && row.progress.state === "running";
		}
		case "Stopped": {
			return row.kind === "run" && isStopped(row.status);
		}
		case "Replays": {
			return row.kind === "replay";
		}
		case "Groups": {
			return row.kind === "group";
		}
		case "Clean corpus only": {
			return row.staleness.state === "available" && isClean(row.staleness);
		}
		default: {
			return filter satisfies never;
		}
	}
}

/** A launch has no record, so only Running, of the narrower filters, names one. */
function launchMatchesFilter(launch: LaunchRow, filter: Filter): boolean {
	return (
		filter === "All" || (filter === "Running" && launch.status === "RUNNING")
	);
}

/**
 * The texts a search looks in: the case, the corpus version under its label
 * so the label's characters match too, and each hard blocker that fired.
 */
function searchedTexts(row: HistoryRow): readonly string[] {
	const corpus =
		row.corpusVersion?.kind === "version"
			? [`${CORPUS_VERSION_LABEL}${row.corpusVersion.digest}`]
			: [];
	const blockers =
		row.kind !== "session-attempt" && row.firedBlockers.state === "available"
			? row.firedBlockers.ids
			: [];

	return [row.caseId ?? "", ...corpus, ...blockers];
}

function matchesSearch(texts: readonly string[], search: string): boolean {
	const needle = search.trim().toLowerCase();

	return texts.some((text) => text.toLowerCase().includes(needle));
}

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
 * The name a record is filed under, the last part of its CLI record id.
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

/** A pipeline run's name opens its run detail, which no other record has. */
function recordName(row: HistoryRow, name: string): React.JSX.Element {
	if (row.kind !== "run") {
		return <span className="font-mono text-sm">{name}</span>;
	}

	return (
		<Link
			to="/runs/$run"
			params={{ run: row.run }}
			className="inline-flex min-h-14 items-start self-start font-mono text-sm text-accent-foreground underline decoration-deeper underline-offset-4 hover:text-pale"
		>
			{name}
		</Link>
	);
}

/** The record's short id, with the identity it is filed under beneath. */
function runCell(row: HistoryRow): React.JSX.Element {
	if (row.shortId === undefined) {
		return recordName(row, identityOf(row));
	}

	return (
		<span className="flex flex-col gap-0.5">
			{recordName(row, row.shortId)}
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
		<label className="flex min-h-11 items-center gap-2 text-xs text-dim">
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
			return outcomeOf(sessionOutcome(row));
		}
		case "replay": {
			return outcomeOf(replayOutcome(row));
		}
		case "group": {
			return (
				<span className="flex flex-col gap-0.5">
					{outcome(groupOutcome(row))}
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
				<RunControls launchId={row.launchId} run={row.run} />
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
			<span className="font-mono text-xs text-dim">{row.status}</span>
			{row.status === "RUNNING" ? (
				<RunControls launchId={row.launchId} run={row.run} />
			) : null}
		</span>
	);
}

/** A record's status glyph with a phrase in place of its word, and why. */
interface OutcomePhrase {
	readonly state: StatusState;
	readonly phrase: string;
	readonly reason: React.ReactNode;
}

function outcomeOf(reading: OutcomePhrase): React.JSX.Element {
	return <span className="flex flex-col gap-0.5">{outcome(reading)}</span>;
}

function outcome({ state, phrase, reason }: OutcomePhrase): React.JSX.Element {
	return (
		<>
			<Status state={state} label={phrase} />
			<span className="text-xs text-dim">{reason}</span>
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
 * A stopped run is a finding, not a failure: the step it stopped at, with
 * that step's grade and the minimum it fell below, opening the step.
 */
function stoppedOutcome(row: RunHistoryRow, stage: string): RunPhrase {
	return {
		phrase: atStep("stopped at", stage, row.stageGrades),
		reason: (
			<a
				href={`/runs/${encodeURIComponent(row.run)}/stages/${encodeURIComponent(stage)}`}
				className="inline-flex min-h-14 items-start self-start text-accent-foreground underline decoration-deeper underline-offset-4 hover:text-pale"
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

/** A replay's verdict grades one step and stops nothing, so it is not a failure. */
function replayOutcome(row: ReplayRow): OutcomePhrase {
	return {
		state: row.status === "CONTINUE" ? "accepted" : "stopped",
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
		reason: [`${String(row.successful)} successful`, ...unread].join(" · "),
	};
}

const SESSION_OUTCOMES = {
	SUCCESSFUL: { state: "accepted", phrase: "successful" },
	UNSUCCESSFUL: { state: "stopped", phrase: "unsuccessful" },
	NO_REPLY: { state: "interrupted", phrase: "no reply" },
	EXECUTION_FAILED: { state: "interrupted", phrase: "failed to run" },
} as const satisfies Record<
	SessionAttemptRow["status"],
	{ readonly state: StatusState; readonly phrase: string }
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
				? "all checks passed"
				: `${String(failed)} of ${plural(checks.declared, "check")} failed`,
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

/** Judged against the version under test, with nothing changed since. */
function isClean(staleness: JudgedStaleness): boolean {
	return (
		staleness.distance.kind === "measured" &&
		!staleness.stale &&
		staleness.distance.versions === 0
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

const NO_GRADE = "·";
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
	return <span className="text-xs text-dim">{reasons.join("; ")}</span>;
}

/** One token per stage, in pipeline order: its letter, or · where it has none. */
function runStepGrades(stageGrades: StageGrades): React.JSX.Element {
	if (stageGrades.state === "unavailable") {
		return reasonsLine(stageGrades.reasons);
	}

	return gradeTokens(
		stageGrades.grades
			.map(({ grade }) =>
				grade.state === "available" ? grade.letter : NO_GRADE,
			)
			.join(" "),
	);
}

function gradeTokens(text: string): React.JSX.Element {
	return <span className="font-mono text-12 tracking-caps">{text}</span>;
}

/**
 * A record that grades only some of its pipeline's stages: each one's token
 * at its position among them and · at the rest, or, where those stages
 * cannot be read, the tokens alone with the reason beside them.
 */
function placedGrades(
	stages: PipelineStages,
	tokens: ReadonlyMap<string, string>,
): React.JSX.Element {
	if (stages.state === "unavailable") {
		return (
			<span className="flex flex-col gap-0.5">
				{gradeTokens([...tokens.values()].join(" "))}
				{reasonsLine(stages.reasons)}
			</span>
		);
	}

	return gradeTokens(
		stages.stages.map((stage) => tokens.get(stage) ?? NO_GRADE).join(" "),
	);
}

/** Each stage some rep graded, as its median and how many reps it covers. */
function groupMedians(row: GroupRow): ReadonlyMap<string, string> {
	return new Map(
		row.stageSummaries.flatMap(({ stage, graded, grades }) =>
			grades.state === "available"
				? [[stage, `${grades.median} (n=${String(graded)})`] as const]
				: [],
		),
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
		const passed = gradeTokens(
			`${String(row.successful)} of ${plural(recorded, "rep")} passed`,
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

	return placedGrades(row.pipelineStages, groupMedians(row));
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
				<span className="font-mono text-xs text-dim">{row.status}</span>
				{reasonsLine(checks.reasons)}
			</span>
		);
	}

	return gradeTokens(
		`${String(checks.passed)} of ${plural(checks.declared, "check")} passed`,
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
function taskGrade({ value, note }: OutcomeReading): React.JSX.Element {
	return (
		<span className="flex flex-col gap-0.5">
			<span className="font-mono text-13 font-bold">{value}</span>
			<span className="text-11 text-dim">{note}</span>
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
			return taskGrade(runTaskGrade(row.finalOutcome));
		}
		case "replay": {
			return taskGrade({ value: NOT_APPLICABLE, note: STEP_REPLAY_ONLY });
		}
		case "group": {
			return taskGrade(groupTaskGrade(row));
		}
		case "session-attempt": {
			return taskGrade({ value: NOT_APPLICABLE, note: SESSION_GRADE_REASON });
		}
		default: {
			return row satisfies never;
		}
	}
}

const UNRECORDED = "unrecorded";

/** A figure a record does not hold, saying so with why rather than blank. */
function unrecorded(reasons: readonly string[]): React.JSX.Element {
	return (
		<span className="flex flex-col gap-0.5">
			<span className="text-xs text-dim">{UNRECORDED}</span>
			{reasonsLine(reasons)}
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
		return unrecorded(cost.reasons);
	}
	if (cost.missing.length === 0) {
		return figure(spendReading(cost.usd));
	}

	return (
		<span className="flex flex-col items-end gap-0.5">
			{figure(spendReading(cost.usd))}
			{reasonsLine([
				`partial · lacks ${cost.missing.map(({ part }) => part).join(", ")}`,
			])}
			<Disclosure
				key={`${row.kind}:${identityOf(row)}`}
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

	return recordedWall(row.wallTime);
}

function recordedWall(wallTime: HistoryRow["wallTime"]): React.JSX.Element {
	if (wallTime.state === "unavailable") {
		return unrecorded(wallTime.reasons);
	}

	return figure(clockReading(wallTime.ms));
}

function filterLabel(filter: Filter, total: number | undefined): string {
	return filter === "All" && total !== undefined ? `All ${total}` : filter;
}

function FilterBar({
	active,
	total,
	onSelect,
	search,
	onSearch,
}: {
	readonly active: Filter;
	readonly total: number | undefined;
	readonly onSelect: (filter: Filter) => void;
	readonly search: string;
	readonly onSearch: (search: string) => void;
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
			<label className="ml-auto flex items-center gap-2 rounded-md border border-strong bg-card px-3 py-1">
				<Search aria-hidden="true" className="size-4 text-dim" />
				<input
					type="search"
					value={search}
					aria-label="Search runs"
					placeholder="case, corpus hash, blocker id"
					onChange={(event) => {
						onSearch(event.target.value);
					}}
					className="w-65 bg-transparent text-12"
				/>
			</label>
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
function launchCells(launch: LaunchRow): readonly React.JSX.Element[] {
	const target = launchTarget(launch);

	return [
		<span key="run" className="font-mono text-sm">
			{`launch ${launch.id.slice(0, 8)}`}
		</span>,
		<span key="case" className="flex flex-col items-start gap-0.5">
			<span className="font-mono text-sm">{target}</span>
			<span className="text-xs text-dim">{launchAttemptsLine(launch)}</span>
		</span>,
		<span key="outcome" className="flex flex-col gap-0.5">
			<Status state={runStatusState(launch.status)} />
			{launch.status === "RUNNING" ? (
				<>
					<span className="text-xs text-dim">started from the browser</span>
					{/* An analysis is one capped call the server refuses to stop. */}
					{launch.target === "analysis" ? undefined : (
						<RunControls launchId={launch.id} run={undefined} />
					)}
				</>
			) : (
				<span className="text-xs text-dim">stopped by the operator</span>
			)}
		</span>,
		<span key="step-grades" />,
		<span key="task-grade" />,
		<span key="corpus" />,
		<span key="cost" />,
		<span key="wall" />,
	];
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
		<div className="flex flex-wrap items-center gap-3 text-sm">
			<span className="font-mono">{`arm A ${armA.groupId}`}</span>
			{armB === undefined ? (
				<span className="text-dim">{`Choose arm B, a group replayed at ${armA.stage} · ${armA.run}`}</span>
			) : (
				<>
					<span className="font-mono">{`arm B ${armB.groupId}`}</span>
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
			<p>
				The corpus is linked and a spend limit is set. Declare a case, then run
				it. Every attempt lands here as a durable record.
			</p>
			<Button asChild>
				<Link to="/cases">Declare a case</Link>
			</Button>
		</EmptyState>
	);
}

/** The records the selected filter and the search both let through. */
function listedRecords(
	records: Pick<RunHistoryResponse, "rows" | "launches">,
	filter: Filter,
	search: string,
): Pick<RunHistoryResponse, "rows" | "launches"> {
	return {
		rows: records.rows.filter(
			(row) =>
				matchesFilter(row, filter) && matchesSearch(searchedTexts(row), search),
		),
		launches: records.launches.filter(
			(launch) =>
				launchMatchesFilter(launch, filter) &&
				matchesSearch([launch.caseId ?? ""], search),
		),
	};
}

export function RunHistoryPage(): React.JSX.Element {
	const [filter, setFilter] = useState<Filter>("All");
	const [search, setSearch] = useState("");
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
	const query = useQuery(polledRunHistoryQuery);

	const unreadable = query.data?.unreadable ?? [];
	const recorded = query.data?.rows ?? [];
	const allLaunches = query.data?.launches ?? [];
	const { rows, launches } = listedRecords(
		{ rows: recorded, launches: allLaunches },
		filter,
		search,
	);
	const listable = recorded.length + allLaunches.length > 0;
	const nothingListed =
		query.isSuccess && rows.length === 0 && launches.length === 0;
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
				aside={
					<LaunchDialog target={{ kind: "case" }} triggerLabel="New run" />
				}
			/>

			<FilterBar
				active={filter}
				total={query.isSuccess ? recorded.length : undefined}
				onSelect={setFilter}
				search={search}
				onSearch={setSearch}
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

				{nothingListed ? (
					<NothingListed
						listable={listable}
						unreadable={unreadable.length > 0}
					/>
				) : null}

				{rows.length > 0 || launches.length > 0 ? (
					<>
						<ComparisonBar
							chosen={chosen}
							onClear={() => {
								setChosen([]);
							}}
						/>
						<TableShell
							caption="DURABLE RECORDS"
							columns={[...COLUMNS]}
							numeric={[...NUMERIC_COLUMNS]}
							rows={[
								...launches.map((launch) => launchCells(launch)),
								...rows.map((row) => [
									<span key="run">{runCell(row)}</span>,
									<span key="case">{caseCell(row)}</span>,
									outcomeCell(row, choice),
									stepGradesCell(row),
									taskGradeCell(row),
									corpusCell(row),
									costCell(row),
									wallCell(row, nowMs),
								]),
							]}
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
