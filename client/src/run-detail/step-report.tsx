import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { DimensionRow } from "#client/monitor/judged-items";
import {
	BlockerRows,
	blockerState,
	DimensionRows,
	Label,
} from "#client/monitor/judged-items";
import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import { endedStatus, hasEnded } from "#client/monitor/run-record-query";
import type { StageJudgeResponse } from "#client/monitor/stage-judge-query";
import { stageJudgeQuery } from "#client/monitor/stage-judge-query";
import type { StageSessionResponse } from "#client/monitor/stage-session-query";
import { stageSessionQuery } from "#client/monitor/stage-session-query";
import { minutesAndSeconds } from "#client/monitor/minutes-and-seconds";
import { plural } from "#client/plural";
import { spendReading } from "#client/run-history/run-progress";
import { Grade } from "#client/system/components/grade";
import { STATUS_VOCABULARY } from "#client/system/components/status";

export type ReadEntry = Extract<
	MonitoredStage["readManifest"],
	{ readonly state: "available" }
>["entries"][number];

const LINE_COUNT = new Intl.NumberFormat("en-US");

const HASH_SHOWN = 6;

export function notRecorded(
	figure: string,
	reasons: readonly string[],
): string {
	return `${figure} not recorded: ${reasons.join("; ")}`;
}

export function skillReading(stage: MonitoredStage): string {
	const { readManifest } = stage;
	if (readManifest.state === "unavailable") {
		return notRecorded("skill", readManifest.reasons);
	}
	const skill = readManifest.entries.find(({ role }) => role === "stage skill");

	return (
		skill?.path ??
		notRecorded("skill", ["the stage's reads name no stage skill"])
	);
}

export function wallTimeReading(stage: MonitoredStage): string {
	return stage.wallTime.state === "available"
		? minutesAndSeconds(stage.wallTime.ms)
		: notRecorded("wall time", stage.wallTime.reasons);
}

type RecordedCost = MonitoredStage["sessionCost"];

function costPart(name: string, cost: RecordedCost): string {
	return cost.state === "available"
		? `${name} ${spendReading(cost.usd)}`
		: notRecorded(`${name} cost`, cost.reasons);
}

/**
 * The stage's session and judge spend together, as its record keeps them, or
 * each part apart when the record lacks one, so a part is never read as the
 * whole.
 */
export function stageCostReading(stage: MonitoredStage): string {
	const { sessionCost, judgeCost } = stage;
	if (sessionCost.state === "available" && judgeCost.state === "available") {
		return spendReading(sessionCost.usd + judgeCost.usd);
	}

	return [costPart("session", sessionCost), costPart("judge", judgeCost)].join(
		" · ",
	);
}

const NO_KEPT_TRANSCRIPT = "Rehearse kept no copy of this step's session";

/** How long the session's transcript runs, or why there is no count. */
function transcriptReading(session: StageSessionResponse): string {
	if (session.state === "closed" || session.state === "running") {
		return session.lineCount === undefined
			? notRecorded("transcript", [
					"Rehearse kept no copy of this step's session",
				])
			: `${LINE_COUNT.format(session.lineCount)} transcript lines`;
	}

	return notRecorded("transcript", [
		session.state === "not-started"
			? "the step has not started"
			: "the run recorded no session id for this step",
	]);
}

/** The session as the page read it: its answer, still loading, or unreadable. */
type SessionRead = StageSessionResponse | "loading" | "unreadable";

function metaLine(stage: MonitoredStage, session: SessionRead): string {
	return [
		skillReading(stage),
		wallTimeReading(stage),
		stageCostReading(stage),
		...(session === "loading"
			? []
			: [
					session === "unreadable"
						? "transcript not read: could not read this step's session"
						: transcriptReading(session),
				]),
	].join(" · ");
}

/** Where the stage's kept transcript is, linked to its session page. */
function SessionOnDisk({
	run,
	stage,
	session,
}: {
	readonly run: string;
	readonly stage: string;
	readonly session: SessionRead;
}): React.JSX.Element | null {
	if (
		session === "loading" ||
		session === "unreadable" ||
		session.state !== "closed"
	) {
		return null;
	}

	return (
		<p className="mt-1 text-11-5 text-muted-foreground">
			Session on disk:{" "}
			{session.transcriptPath === undefined ? (
				`not recorded: ${NO_KEPT_TRANSCRIPT}`
			) : (
				<Link
					to="/runs/$run/stages/$stage"
					params={{ run, stage }}
					className="font-mono"
				>
					{session.transcriptPath}
				</Link>
			)}
		</p>
	);
}

function StatCard({
	label,
	children,
}: {
	readonly label: string;
	readonly children: React.ReactNode;
}): React.JSX.Element {
	return (
		<div
			role="group"
			aria-label={label}
			className="rounded-card border border-strong bg-raised px-3.5 py-2.25 text-right"
		>
			<Label>{label}</Label>
			{children}
		</div>
	);
}

function GradeStat({
	stage,
	record,
}: {
	readonly stage: MonitoredStage;
	readonly record: RunRecordResponse;
}): React.JSX.Element {
	const { grade } = stage;

	return (
		<StatCard label="Grade">
			<Grade
				size="card"
				value={
					grade.state === "available"
						? { letter: grade.letter }
						: { pending: true }
				}
			/>
			<div className="text-10-5 text-muted-foreground">
				{grade.state === "unavailable"
					? notRecorded("grade", grade.reasons)
					: null}
				{record.minimumGrade.state === "available"
					? `min ${record.minimumGrade.letter}`
					: notRecorded("minimum", record.minimumGrade.reasons)}
			</div>
		</StatCard>
	);
}

/** How many of the judge's hard blockers fired, from the judge's own record. */
function firedReading(judge: StageJudgeResponse | undefined): string {
	if (judge === undefined) {
		return "";
	}
	if (judge.state === "judged") {
		const fired = judge.hardBlockers.filter(
			({ status }) => status === "FAIL",
		).length;

		return `${plural(fired, "blocker")} fired`;
	}
	if (judge.state === "not-judged") {
		return notRecorded("blockers", ["the judge never graded this step"]);
	}

	return "blockers pending";
}

function VerdictStat({
	stage,
	judge,
}: {
	readonly stage: MonitoredStage;
	readonly judge: StageJudgeResponse | undefined;
}): React.JSX.Element {
	const state = hasEnded(stage) ? endedStatus(stage) : "pending";

	return (
		<StatCard label="Verdict">
			<div className="mt-1.25 flex items-center justify-end gap-1.75 text-14">
				<span aria-hidden="true">{STATUS_VOCABULARY[state].glyph}</span>
				{STATUS_VOCABULARY[state].word}
			</div>
			<div className="text-10-5 text-muted-foreground">
				{firedReading(judge)}
			</div>
		</StatCard>
	);
}

function SectionTitle({
	children,
}: {
	readonly children: React.ReactNode;
}): React.JSX.Element {
	return (
		<h3 className="mt-4.5 text-10 tracking-label text-dim uppercase">
			{children}
		</h3>
	);
}

/** Each dimension with the judge's first recorded claim as its note. */
function notedDimensions(
	judge: Extract<StageJudgeResponse, { readonly state: "judged" }>,
): readonly DimensionRow[] {
	return judge.dimensions.map(({ id, grade, evidence }) => ({
		id,
		grade,
		evidence,
		note: evidence[0]?.claim,
	}));
}

function JudgedSections({
	run,
	stage,
	judge,
}: {
	readonly run: string;
	readonly stage: string;
	readonly judge: StageJudgeResponse | "unreadable" | undefined;
}): React.JSX.Element | null {
	if (judge === undefined) {
		return null;
	}
	if (judge === "unreadable") {
		return (
			<p className="mt-4.5 text-12 text-muted-foreground">
				Could not read this step's judge.
			</p>
		);
	}
	if (judge.state !== "judged") {
		return (
			<p className="mt-4.5 text-12 text-muted-foreground">
				{judge.state === "not-judged"
					? "This step ended without a judged grade, so there are no blockers or dimensions to show."
					: "This step's judge has not returned its blockers and dimensions yet."}
			</p>
		);
	}

	return (
		<div className="max-w-225">
			<SectionTitle>Hard blockers</SectionTitle>
			<BlockerRows
				run={run}
				stage={stage}
				rows={judge.hardBlockers.map(({ id, status, evidence }) => ({
					id,
					state: blockerState(status),
					evidence,
				}))}
			/>
			<SectionTitle>Quality dimensions</SectionTitle>
			<DimensionRows run={run} stage={stage} rows={notedDimensions(judge)} />
		</div>
	);
}

/** Why a read has no changed state: what the server could not compare it against. */
function notComparedReason(entry: ReadEntry): string {
	if (entry.half === "project") {
		return "a project file is not part of the corpus";
	}
	if (entry.sha256 === undefined) {
		return "no hash was recorded";
	}

	return "the corpus under test cannot compare it";
}

export function ReadState({
	entry,
}: {
	readonly entry: ReadEntry;
}): React.JSX.Element {
	if (entry.state === "unchanged") {
		return (
			<>
				<span aria-hidden="true">✓</span>unchanged
			</>
		);
	}
	if (entry.state === "changed") {
		return (
			<>
				<span aria-hidden="true">⚠</span>changed since this run
			</>
		);
	}

	return <>not compared · {notComparedReason(entry)}</>;
}

function InstructionsRead({
	stage,
}: {
	readonly stage: MonitoredStage;
}): React.JSX.Element {
	const { readManifest } = stage;

	return (
		<>
			<SectionTitle>Instructions this step read</SectionTitle>
			{readManifest.state === "unavailable" ? (
				<p className="mt-2 text-12 text-muted-foreground">
					{notRecorded("Instructions read", readManifest.reasons)}
				</p>
			) : (
				<table
					aria-label="Instructions this step read"
					className="mt-2 w-full max-w-225 border border-border font-mono text-11-5"
				>
					<thead className="sr-only">
						<tr>
							<th>Path</th>
							<th>Hash</th>
							<th>Since this run</th>
						</tr>
					</thead>
					<tbody>
						{readManifest.entries.map((entry) => (
							<tr
								key={`${entry.half}:${entry.path}`}
								className="border-b border-subtle"
							>
								<td className="px-2.75 py-1.5">{entry.path}</td>
								<td className="px-2.75 py-1.5 text-dim">
									{entry.sha256?.slice(0, HASH_SHOWN) ?? "no hash"}
								</td>
								<td className="px-2.75 py-1.5 font-sans text-11 text-muted-foreground">
									<span className="flex items-center gap-1.25">
										<ReadState entry={entry} />
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</>
	);
}

/**
 * One stage's report (SPEC.md 4a): what it ran and cost, its grade against
 * the run's minimum, the judge's blockers and dimensions with their cited
 * evidence, and the instructions it read with whether each changed since.
 */
export function StepReport({
	run,
	record,
	stage,
	number,
}: {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
	readonly number: number;
}): React.JSX.Element {
	const judge = useQuery(stageJudgeQuery(run, stage.stage));
	const session = useQuery(stageSessionQuery(run, stage.stage));
	const sessionRead: SessionRead = session.isError
		? "unreadable"
		: (session.data ?? "loading");

	return (
		<section
			aria-label="Step report"
			className="overflow-y-auto px-5 pt-4 pb-8"
		>
			<div className="flex flex-wrap items-start gap-4">
				<div>
					<h2 className="text-15">
						Step {String(number)} · {stage.stage}
					</h2>
					<p className="mt-1 font-mono text-11-5 text-dim">
						{metaLine(stage, sessionRead)}
					</p>
					<SessionOnDisk run={run} stage={stage.stage} session={sessionRead} />
				</div>
				<div className="ml-auto flex gap-2.5">
					<GradeStat stage={stage} record={record} />
					<VerdictStat stage={stage} judge={judge.data} />
				</div>
			</div>
			<JudgedSections
				run={run}
				stage={stage.stage}
				judge={judge.isError ? "unreadable" : judge.data}
			/>
			<InstructionsRead stage={stage} />
		</section>
	);
}
