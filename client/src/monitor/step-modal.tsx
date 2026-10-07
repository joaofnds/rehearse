import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { LaunchDialog } from "#client/launch/launch-dialog";
import { plural } from "#client/plural";
import {
	HASH_SHOWN,
	NO_KEPT_TRANSCRIPT,
	notRecorded,
	ReadState,
	skillReading,
	stageCostReading,
	wallTimeReading,
} from "#client/run-detail/step-report";
import { Grade } from "#client/system/components/grade";
import { STATUS_VOCABULARY } from "#client/system/components/status";
import { Button } from "#client/system/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "#client/system/ui/dialog";
import {
	consumedCheckpointMissing,
	endedStatus,
	hasEnded,
} from "./run-record-query";
import type { MonitoredStage, RunRecordResponse } from "./run-record-query";
import { stageJudgeQuery } from "./stage-judge-query";
import type { StageJudgeResponse } from "./stage-judge-query";
import { stageSessionQuery } from "./stage-session-query";

/** The name the server gives the checkpoint a run's first stage starts from. */
const INITIAL_CHECKPOINT = "initial";

/**
 * What the header says of the stage: its skill, wall time and cost as its
 * record keeps them, or pending while the stage has not ended.
 */
function figuresReading(stage: MonitoredStage): string {
	if (!hasEnded(stage)) {
		return "skill pending · wall time pending · cost pending";
	}

	return [
		skillReading(stage),
		wallTimeReading(stage),
		stageCostReading(stage),
	].join(" · ");
}

function verdictReading(stage: MonitoredStage): string {
	return hasEnded(stage)
		? STATUS_VOCABULARY[endedStatus(stage)].word
		: STATUS_VOCABULARY.pending.word;
}

/** The stage's grade as a letter, or why the header has none to show. */
function GradeReading({
	stage,
}: {
	readonly stage: MonitoredStage;
}): React.JSX.Element {
	if (stage.grade.state === "available") {
		return <Grade size="node" value={{ letter: stage.grade.letter }} />;
	}

	return (
		<span className="text-11-5 text-secondary-foreground">
			{hasEnded(stage)
				? notRecorded("grade", stage.grade.reasons)
				: "grade pending"}
		</span>
	);
}

function ModalHeader({
	stage,
	number,
}: {
	readonly stage: MonitoredStage;
	readonly number: number;
}): React.JSX.Element {
	return (
		<header className="flex flex-none flex-wrap items-center gap-3 border-b border-strong px-4 py-3">
			<span className="font-mono text-10 tracking-label text-dim uppercase">
				Step {String(number).padStart(2, "0")}
			</span>
			<DialogTitle>{stage.stage}</DialogTitle>
			<span className="font-mono text-11 text-muted-foreground">
				{figuresReading(stage)}
			</span>
			<span className="ml-auto flex items-center gap-2.25">
				<span className="text-11-5 text-secondary-foreground">
					verdict {verdictReading(stage)}
				</span>{" "}
				<GradeReading stage={stage} />
				<DialogClose asChild>
					<Button variant="outline" size="sm" aria-label="Close">
						Esc
					</Button>
				</DialogClose>
			</span>
		</header>
	);
}

type ArtifactIn = MonitoredStage["artifactsIn"]["entries"][number];

type MissingPart = MonitoredStage["artifactsIn"]["missing"][number];

function stepName(record: RunRecordResponse, stage: string): string {
	const index = record.stages.findIndex((each) => each.stage === stage);

	return `step ${String(index + 1).padStart(2, "0")}`;
}

function SectionTitle({
	id,
	children,
}: {
	readonly id?: string;
	readonly children: React.ReactNode;
}): React.JSX.Element {
	return (
		<h3
			id={id}
			className="mt-3.5 text-10 tracking-label text-dim uppercase first:mt-0"
		>
			{children}
		</h3>
	);
}

function InstructionsLoaded({
	stage,
	labelledBy,
}: {
	readonly stage: MonitoredStage;
	readonly labelledBy: string;
}): React.JSX.Element {
	const { readManifest } = stage;
	if (readManifest.state === "unavailable") {
		return (
			<p className="mt-2 text-12 text-muted-foreground">
				{hasEnded(stage)
					? notRecorded("Instructions", readManifest.reasons)
					: "Instructions pending: the step has not ended"}
			</p>
		);
	}

	return (
		<ul
			aria-labelledby={labelledBy}
			className="mt-2 overflow-hidden rounded-card border border-border"
		>
			{readManifest.entries.map((entry) => (
				<li
					key={`${entry.half}:${entry.path}`}
					className="border-b border-subtle px-2.5 py-1.75 last:border-b-0"
				>
					<span className="flex items-center gap-2.25">
						<span className="flex-1 font-mono text-11-5">{entry.path}</span>
						<span className="font-mono text-10-5 text-dim">
							{entry.sha256 === undefined
								? "no hash"
								: `sha ${entry.sha256.slice(0, HASH_SHOWN)}`}
						</span>
					</span>
					<span className="mt-0.5 flex items-center gap-2 text-10-5">
						<span className="text-dim">{entry.role}</span>
						<span className="flex items-center gap-1.25 text-muted-foreground">
							<ReadState entry={entry} />
						</span>
					</span>
				</li>
			))}
		</ul>
	);
}

type UpstreamCheckpoint = Extract<
	ArtifactIn,
	{ readonly from: "upstream checkpoint" }
>;

/** The checkpoint by its short id, or by whose it is when it has none. */
function checkpointName({
	checkpointShortId,
	upstream,
}: UpstreamCheckpoint): string {
	if (checkpointShortId.state === "available") {
		return checkpointShortId.shortId;
	}

	return upstream === INITIAL_CHECKPOINT
		? "the initial checkpoint"
		: `${upstream}'s checkpoint`;
}

/** An artifact in as the modal names it, and where it came from. */
interface ArtifactInRow {
	readonly name: string;
	readonly from: string;
}

function artifactInReading(
	record: RunRecordResponse,
	artifact: ArtifactIn,
): ArtifactInRow {
	if (artifact.from === "task declaration") {
		return { name: artifact.taskId, from: "task declaration" };
	}
	if (artifact.from === "upstream checkpoint") {
		const initial = artifact.upstream === INITIAL_CHECKPOINT;

		return {
			name: `${artifact.target} at ${checkpointName(artifact)}`,
			from: initial
				? "initial checkpoint"
				: `${stepName(record, artifact.upstream)} checkpoint`,
		};
	}

	return {
		name: artifact.path,
		from: `${stepName(record, artifact.stage)} · ${artifact.stage} · ${artifact.change}`,
	};
}

function ArtifactsIn({
	record,
	stage,
	labelledBy,
}: {
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
	readonly labelledBy: string;
}): React.JSX.Element {
	const { entries, missing } = stage.artifactsIn;

	return (
		<>
			<ul aria-labelledby={labelledBy} className="mt-2 flex flex-col gap-1">
				{entries.map((artifact) => {
					const { name, from } = artifactInReading(record, artifact);

					return (
						<li
							key={`${name}:${from}`}
							className="flex items-center gap-2.25 rounded-md border border-border px-2.5 py-1.5"
						>
							<span aria-hidden="true" className="text-dim">
								↓
							</span>
							<span className="flex-1 font-mono text-11-5 break-all">
								{name}
							</span>
							<span className="text-10-5 text-dim">{from}</span>
						</li>
					);
				})}
			</ul>
			{missing.map(({ part, reason }) => (
				<p key={part} className="mt-1.5 text-11 text-dim">
					Not read: the workflow-state changes of {stepName(record, part)} ·{" "}
					{part}, as {reason}
				</p>
			))}
		</>
	);
}

/** What went into the stage: the instructions it loaded and what it started from. */
function WhatWentIn({
	record,
	stage,
}: {
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
}): React.JSX.Element {
	const instructionsId = useId();
	const artifactsInId = useId();

	return (
		<section aria-label="What went in">
			<SectionTitle id={instructionsId}>
				Instructions this step loaded
			</SectionTitle>
			<InstructionsLoaded stage={stage} labelledBy={instructionsId} />
			<SectionTitle id={artifactsInId}>Artifacts in</SectionTitle>
			<ArtifactsIn record={record} stage={stage} labelledBy={artifactsInId} />
		</section>
	);
}

interface ArtifactOutRow {
	readonly name: string;
	readonly detail: string;
}

/** Each artifact the stage's record says it produced, with the detail the record holds. */
function artifactOutRows(stage: MonitoredStage): readonly ArtifactOutRow[] {
	const { declared, workflowState, commitSubjects, changedPaths } =
		stage.artifactsOut;

	return [
		...(declared.state === "available"
			? declared.paths.map((path) => ({
					name: path,
					detail: "declared artifact",
				}))
			: []),
		...(workflowState.state === "available"
			? workflowState.changes.map(({ path, change }) => ({
					name: path,
					detail: `workflow state · ${change}`,
				}))
			: []),
		...(commitSubjects.state === "available"
			? commitSubjects.subjects.map((subject) => ({
					name: subject,
					detail: "commit",
				}))
			: []),
		...(changedPaths.state === "available"
			? changedPaths.paths.map((path) => ({
					name: path,
					detail: "changed path",
				}))
			: []),
	];
}

/**
 * Each part of an ended stage's artifacts out its record cannot read, so an
 * unreadable record does not pass for one that produced nothing.
 */
function unreadArtifactsOut(stage: MonitoredStage): readonly MissingPart[] {
	if (!hasEnded(stage)) {
		return [];
	}

	const { declared, workflowState, commitSubjects, changedPaths } =
		stage.artifactsOut;

	return [
		{ part: "the declared artifact", reading: declared },
		{ part: "the workflow-state changes", reading: workflowState },
		{ part: "the commit subjects", reading: commitSubjects },
		{ part: "the changed paths", reading: changedPaths },
	].flatMap(({ part, reading }) =>
		reading.state === "unavailable"
			? [{ part, reason: reading.reasons.join("; ") }]
			: [],
	);
}

function ArtifactsOut({
	stage,
}: {
	readonly stage: MonitoredStage;
}): React.JSX.Element | null {
	const headingId = useId();
	const rows = artifactOutRows(stage);
	const unread = unreadArtifactsOut(stage);
	if (rows.length === 0 && unread.length === 0) {
		return null;
	}

	return (
		<>
			<SectionTitle id={headingId}>Artifacts out</SectionTitle>
			<ul aria-labelledby={headingId} className="mt-2 flex flex-col gap-1">
				{rows.map(({ name, detail }, index) => (
					<li
						key={`${detail}:${name}:${index}`}
						className="flex items-center gap-2.25 rounded-md border border-deeper bg-selected px-2.5 py-1.5"
					>
						<span aria-hidden="true" className="text-muted-foreground">
							↑
						</span>
						<span className="flex-1 font-mono text-11-5 break-all">{name}</span>
						<span className="font-mono text-10-5 text-muted-foreground">
							{detail}
						</span>
					</li>
				))}
			</ul>
			{unread.map(({ part, reason }) => (
				<p key={part} className="mt-1.5 text-11 text-dim">
					Not read: {part}, as {reason}
				</p>
			))}
		</>
	);
}

/** The judge in one line: its fired blockers and returned dimensions. */
function judgeLine(
	judge: StageJudgeResponse | "unreadable" | undefined,
): string {
	if (judge === undefined) {
		return "reading the judge";
	}
	if (judge === "unreadable") {
		return "Could not read this step's judge.";
	}
	if (judge.state === "judged") {
		const fired = judge.hardBlockers.filter(
			({ status }) => status === "FAIL",
		).length;

		return `${String(fired)} of ${plural(judge.hardBlockers.length, "blocker")} fired · ${plural(judge.dimensions.length, "dimension")} returned`;
	}
	if (judge.state === "not-judged") {
		return "not judged: the step ended without a judged grade";
	}
	if (judge.state === "returning" && judge.progress !== undefined) {
		const { hardBlockers, dimensions } = judge.progress.sections;

		return `${String(hardBlockers.returned)} of ${plural(hardBlockers.total, "blocker")} evaluated · ${String(dimensions.returned)} of ${plural(dimensions.total, "dimension")} returned`;
	}

	return "judge pending";
}

/** Where the stage's transcript is kept, linked to its session page. */
function SessionLink({
	run,
	stage,
}: {
	readonly run: string;
	readonly stage: string;
}): React.JSX.Element | null {
	const session = useQuery(stageSessionQuery(run, stage));
	if (session.isError) {
		return (
			<span className="self-center text-11-5 text-muted-foreground">
				Could not read this step's session.
			</span>
		);
	}
	if (session.data === undefined) {
		return null;
	}
	if (session.data.state !== "closed") {
		return null;
	}
	if (session.data.transcriptPath === undefined) {
		return (
			<span className="self-center text-11-5 text-muted-foreground">
				session.jsonl not recorded: {NO_KEPT_TRANSCRIPT}
			</span>
		);
	}

	return (
		<Link
			to="/runs/$run/stages/$stage"
			params={{ run, stage }}
			className="self-center text-11-5"
		>
			session.jsonl on disk
		</Link>
	);
}

function JudgeSummary({
	run,
	stage,
}: {
	readonly run: string;
	readonly stage: string;
}): React.JSX.Element {
	const judge = useQuery(stageJudgeQuery(run, stage));

	return (
		<>
			<SectionTitle>Judge</SectionTitle>
			<p className="mt-1.75 text-12 text-pretty text-secondary-foreground">
				{judgeLine(judge.isError ? "unreadable" : judge.data)}
			</p>
			<div className="mt-2.25 flex flex-wrap gap-2">
				<Button asChild variant="outline" size="sm">
					<Link
						to="/runs/$run"
						params={{ run }}
						search={{ layout: "rail", step: stage }}
					>
						Full step report
					</Link>
				</Button>
				<SessionLink run={run} stage={stage} />
			</div>
		</>
	);
}

/**
 * Replay opens the launch dialog on the checkpoint the stage started from,
 * and is disabled with the reason when that checkpoint is missing.
 */
function ReplayFromCheckpoint({
	run,
	record,
	stage,
}: {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly stage: string;
}): React.JSX.Element {
	const reasonId = useId();
	if (consumedCheckpointMissing(record, stage)) {
		return (
			<>
				<Button
					variant="outline"
					size="sm"
					aria-disabled="true"
					aria-describedby={reasonId}
				>
					Replay from checkpoint
				</Button>
				<span id={reasonId} className="self-center text-11 text-dim">
					{stage} has no checkpoint to replay from
				</span>
			</>
		);
	}

	return (
		<LaunchDialog
			target={{ kind: "replay", run, stage }}
			trigger={
				<Button variant="outline" size="sm">
					Replay from checkpoint
				</Button>
			}
		/>
	);
}

function OperateOnStep({
	run,
	record,
	stage,
}: {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly stage: string;
}): React.JSX.Element {
	return (
		<>
			<SectionTitle>Operate on this step</SectionTitle>
			<div className="mt-2 flex flex-wrap gap-2">
				<ReplayFromCheckpoint run={run} record={record} stage={stage} />
				<Button variant="outline" size="sm" aria-disabled="true">
					Edit this step
				</Button>
				<Button variant="outline" size="sm" asChild>
					<Link to="/corpus">Edit its skill</Link>
				</Button>
			</div>
			<p className="mt-2 text-11 text-pretty text-dim">
				Editing a step is planned for a later version. Its skill and the other
				instruction files are edited on the{" "}
				<Link to="/corpus">Corpus screen</Link>, which writes a new corpus
				version.
			</p>
		</>
	);
}

/** What came out of the stage, its judge, and what can be done with it. */
function WhatCameOut({
	run,
	record,
	stage,
}: {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
}): React.JSX.Element {
	return (
		<section aria-label="What came out">
			<ArtifactsOut stage={stage} />
			<JudgeSummary run={run} stage={stage.stage} />
			<OperateOnStep run={run} record={record} stage={stage.stage} />
		</section>
	);
}

/**
 * A task-graph node's `in / out` action and the step modal it opens (SPEC.md
 * 2c and 3): what went into the stage, what came out, its judge, and the
 * operations on it.
 */
export function StepModalAction({
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
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant="quiet"
					size="xs"
					aria-label={`${stage.stage} — instructions in, artifacts out`}
				>
					in / out ▸
				</Button>
			</DialogTrigger>
			<DialogContent width="wide">
				<ModalHeader stage={stage} number={number} />
				<div className="grid flex-1 grid-cols-2 gap-4.5 overflow-y-auto px-4 py-3.5">
					<WhatWentIn record={record} stage={stage} />
					<WhatCameOut run={run} record={record} stage={stage} />
				</div>
			</DialogContent>
		</Dialog>
	);
}
