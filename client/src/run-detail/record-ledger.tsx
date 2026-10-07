import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { GitCommitHorizontal, RotateCcw } from "lucide-react";
import { useId, useState } from "react";
import { isStopped } from "#benchmark/stopped-status";
import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import {
	BlockerLine,
	blockerState,
	DimensionLine,
	EvidenceLink,
	EvidenceToggle,
	Label,
	SourceChip,
} from "#client/monitor/judged-items";
import type {
	Evidence,
	EvidenceOwner,
	JudgedAnswer,
	RowEvidence,
} from "#client/monitor/judged-items";
import type { StageJudgeResponse } from "#client/monitor/stage-judge-query";
import { stageJudgeQuery } from "#client/monitor/stage-judge-query";
import type { StageSessionResponse } from "#client/monitor/stage-session-query";
import { stageSessionQuery } from "#client/monitor/stage-session-query";
import type { NodeStatus } from "#client/monitor/task-graph";
import {
	costReading,
	durationReading,
	nodeStatus,
} from "#client/monitor/task-graph";
import { useNow } from "#client/run-history/use-now";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { CorpusPill } from "#client/system/components/corpus-pill";
import { Grade } from "#client/system/components/grade";
import { LiveGlyph, STATUS_VOCABULARY } from "#client/system/components/status";
import { ReplayButton } from "./replay-button";
import { NO_KEPT_TRANSCRIPT, unjudgedReading } from "./step-report";

const LINE_COUNT = new Intl.NumberFormat("en-US");

/** The stage's judge as the page read it: its answer, still loading, or unreadable. */
type JudgeRead = StageJudgeResponse | "unreadable" | undefined;

/** How long the stage's kept transcript runs, as far as the page has read it. */
function linesReading(
	session: StageSessionResponse | undefined,
	unreadable: boolean,
): readonly string[] {
	if (unreadable) {
		return ["lines not read"];
	}
	if (session === undefined) {
		return [];
	}

	return (session.state === "closed" || session.state === "running") &&
		session.lineCount !== undefined
		? [`${LINE_COUNT.format(session.lineCount)} lines`]
		: ["lines not recorded"];
}

/**
 * The stage's status in the card's words: a stage whose letter fell below the
 * run's minimum says so beside the run stopping on it.
 */
function cardStatus(
	stage: MonitoredStage,
	row: PipelineRow,
	record: RunRecordResponse,
): NodeStatus {
	const status = nodeStatus(stage, row);
	const { minimumGrade } = record;
	if (
		status.state !== "stopped" ||
		minimumGrade.state === "unavailable" ||
		stage.grade.state === "unavailable" ||
		stage.grade.reachesMinimum
	) {
		return status;
	}

	return {
		state: "stopped",
		words: `below minimum ${minimumGrade.letter} · run stopped`,
	};
}

function StatusWords({
	status,
}: {
	readonly status: NodeStatus;
}): React.JSX.Element {
	return (
		<span className="flex items-center gap-1.5 text-11-5 text-muted-foreground">
			{status.state === "running" ? (
				<LiveGlyph tone="surrounding" />
			) : (
				<span aria-hidden="true">{STATUS_VOCABULARY[status.state].glyph}</span>
			)}
			{status.words}
		</span>
	);
}

function CorpusReading({
	stage,
}: {
	readonly stage: MonitoredStage;
}): React.JSX.Element {
	const { corpusVersion } = stage;

	return (
		<span className="ml-auto">
			{corpusVersion?.kind === "version" ? (
				<CorpusPill hash={corpusVersion.digest} />
			) : (
				<span className="text-11-5 text-muted-foreground">
					{corpusMeasurementReading(corpusVersion)}
				</span>
			)}
		</span>
	);
}

function JudgedColumns({
	judge,
}: {
	readonly judge: JudgedAnswer;
}): React.JSX.Element {
	return (
		<div className="grid grid-cols-2 gap-4.5 px-3.5 py-2.75">
			<div>
				<Label>Blockers</Label>
				<ul
					aria-label="Hard blockers"
					className="mt-1.5 flex flex-col gap-0.75"
				>
					{judge.hardBlockers.map(({ id, status }) => (
						<li key={id} className="flex items-center gap-2">
							<BlockerLine row={{ id, state: blockerState(status) }} />
						</li>
					))}
				</ul>
			</div>
			<div>
				<Label>Dimensions</Label>
				<ul
					aria-label="Quality dimensions"
					className="mt-1.5 flex flex-col gap-0.75"
				>
					{judge.dimensions.map(({ id, grade }) => (
						<li key={id} className="flex items-center gap-2.5">
							<DimensionLine row={{ id, grade }} />
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

/** The card's body: the judge's blockers and dimensions, or why there are none. */
function CardBody({
	judge,
}: {
	readonly judge: JudgeRead;
}): React.JSX.Element | null {
	if (judge === undefined) {
		return null;
	}
	if (judge !== "unreadable" && judge.state === "judged") {
		return <JudgedColumns judge={judge} />;
	}

	return (
		<p className="px-3.5 py-2.75 text-11-5 text-muted-foreground">
			{unjudgedReading(judge)}
		</p>
	);
}

/** What the stage kept to replay from, or what stopping did instead. */
function checkpointWords(stage: MonitoredStage, row: PipelineRow): string {
	if (stage.checkpoint === "recorded") {
		const name =
			stage.checkpointShortId.state === "available"
				? stage.checkpointShortId.shortId
				: "checkpoint";

		return `${name} · frozen state retained`;
	}

	return isStopped(row.status)
		? "no checkpoint saved · repository restored"
		: "no checkpoint saved";
}

/** Every item the judge cited for the stage, or pending until it answers. */
function cardEvidence(judge: JudgeRead): RowEvidence {
	if (judge === undefined) {
		return "pending";
	}
	if (judge === "unreadable") {
		return [];
	}
	if (judge.state === "judged") {
		return [...judge.hardBlockers, ...judge.dimensions].flatMap(
			({ evidence }) => evidence,
		);
	}

	return judge.state === "not-judged" ? [] : "pending";
}

function CardFooter({
	row,
	record,
	stage,
	evidence,
	shown,
	onToggle,
}: {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
	readonly evidence: RowEvidence;
	readonly shown: string | undefined;
	readonly onToggle: () => void;
}): React.JSX.Element {
	const CheckpointIcon =
		stage.checkpoint === "recorded" ? GitCommitHorizontal : RotateCcw;

	return (
		<footer className="flex flex-wrap items-center gap-2.5 border-t border-border px-3.5 py-2.25">
			<span className="flex items-center gap-1.5 font-mono text-11 text-secondary-foreground">
				<CheckpointIcon aria-hidden="true" className="size-3" />
				{checkpointWords(stage, row)}
			</span>
			<span className="ml-auto">
				<EvidenceToggle evidence={evidence} shown={shown} onToggle={onToggle} />
			</span>
			<ReplayButton
				run={row.run}
				record={record}
				stage={stage.stage}
				label="Replay from here"
			/>
		</footer>
	);
}

interface CitedItem {
	readonly owner: EvidenceOwner;
	readonly index: number;
	readonly cited: Evidence;
}

/** Each item the judge cited, with the blocker or dimension it supports. */
function citedItems(
	run: string,
	stage: string,
	judge: JudgedAnswer,
): readonly CitedItem[] {
	const sections = [
		["hardBlockers", judge.hardBlockers],
		["dimensions", judge.dimensions],
	] as const;

	return sections.flatMap(([section, items]) =>
		items.flatMap(({ id, evidence }) =>
			evidence.map((cited, index) => ({
				owner: { run, stage, section, item: id },
				index,
				cited,
			})),
		),
	);
}

/** Where the rest of the session is: its kept transcript, or why none is kept. */
function FullSession({
	run,
	stage,
	session,
}: {
	readonly run: string;
	readonly stage: string;
	readonly session: StageSessionResponse | "unreadable" | undefined;
}): React.JSX.Element | null {
	if (session === undefined) {
		return null;
	}
	if (session === "unreadable") {
		return <>Could not read this step's session.</>;
	}
	if (session.state === "closed" && session.transcriptPath !== undefined) {
		return (
			<Link to="/runs/$run/stages/$stage" params={{ run, stage }}>
				Open the full session on disk
			</Link>
		);
	}

	return (
		<>
			The full session is not recorded:{" "}
			{session.state === "closed" || session.state === "running"
				? NO_KEPT_TRANSCRIPT
				: "the run recorded no session for this step"}
		</>
	);
}

/** The stage's cited evidence, wide: what each item is and supports, beside its quote. */
function WideEvidence({
	id,
	items,
	fullSession,
}: {
	readonly id: string;
	readonly items: readonly CitedItem[];
	readonly fullSession: React.ReactNode;
}): React.JSX.Element {
	return (
		<section
			id={id}
			aria-label="Cited evidence"
			className="border-t border-border bg-background px-3.5 py-3"
		>
			<Label>Cited evidence · {String(items.length)} items</Label>
			<ul>
				{items.map(({ owner, index, cited }) => (
					<li
						key={`${owner.section}:${owner.item}:${String(index)}`}
						className="mt-2.5 grid grid-cols-ledger-evidence items-start gap-3"
					>
						<div className="font-mono text-10-5 text-muted-foreground">
							<SourceChip cited={cited} />
							<div className="mt-1">
								<EvidenceLink owner={owner} index={index} cited={cited} />
							</div>
							<div className="mt-1 font-sans text-dim">
								supports {owner.item}
							</div>
						</div>
						{cited.quote === undefined ? null : (
							<blockquote className="border-l-2 border-deeper bg-card px-2.5 py-1.75 font-mono text-11-5 whitespace-pre-wrap text-bright">
								{cited.quote}
							</blockquote>
						)}
					</li>
				))}
			</ul>
			<p className="mt-3 text-11-5 text-dim">
				Uncited spans are not stored here. {fullSession}
			</p>
		</section>
	);
}

function judgedAnswer(judge: JudgeRead): JudgedAnswer | undefined {
	return judge !== undefined &&
		judge !== "unreadable" &&
		judge.state === "judged"
		? judge
		: undefined;
}

function CardHeader({
	stage,
	number,
	status,
	meta,
}: {
	readonly stage: MonitoredStage;
	readonly number: number;
	readonly status: NodeStatus;
	readonly meta: string;
}): React.JSX.Element {
	return (
		<div
			className={`flex flex-wrap items-center gap-3 border-b border-border px-3.5 py-2.75 ${status.state === "stopped" ? "bg-fired" : "bg-raised"}`}
		>
			<span aria-hidden="true" className="font-mono text-11 text-dim">
				{String(number).padStart(2, "0")}
			</span>
			<h2 className="text-14">{stage.stage}</h2>
			<StatusWords status={status} />
			<span className="font-mono text-11 text-dim">{meta}</span>
			<CorpusReading stage={stage} />
			<span className="w-8 text-right">
				<Grade
					size="node"
					value={
						stage.grade.state === "available"
							? { letter: stage.grade.letter }
							: { pending: true }
					}
				/>
			</span>
		</div>
	);
}

function LedgerCard({
	row,
	record,
	stage,
	number,
	nowMs,
}: {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
	readonly number: number;
	readonly nowMs: number;
}): React.JSX.Element {
	const session = useQuery(stageSessionQuery(row.run, stage.stage));
	const judge = useQuery(stageJudgeQuery(row.run, stage.stage));
	const [expanded, setExpanded] = useState(false);
	const evidenceId = useId();
	const status = cardStatus(stage, row, record);
	const judgeRead: JudgeRead = judge.isError ? "unreadable" : judge.data;
	const judged = judgedAnswer(judgeRead);
	const meta = [
		durationReading(stage, row, nowMs),
		costReading(stage, row),
		...linesReading(session.data, session.isError),
	].join(" · ");

	return (
		<article
			aria-label={`Step ${String(number)} · ${stage.stage}`}
			className={`overflow-hidden rounded-card border bg-card ${status.state === "stopped" ? "border-deeper" : "border-border"}`}
		>
			<CardHeader stage={stage} number={number} status={status} meta={meta} />
			<CardBody judge={judgeRead} />
			<CardFooter
				row={row}
				record={record}
				stage={stage}
				evidence={cardEvidence(judgeRead)}
				shown={expanded ? evidenceId : undefined}
				onToggle={() => {
					setExpanded((open) => !open);
				}}
			/>
			{expanded && judged !== undefined ? (
				<WideEvidence
					id={evidenceId}
					items={citedItems(row.run, stage.stage, judged)}
					fullSession={
						<FullSession
							run={row.run}
							stage={stage.stage}
							session={session.isError ? "unreadable" : session.data}
						/>
					}
				/>
			) : null}
		</article>
	);
}

/**
 * Record ledger (SPEC.md 4b): every stage's durable record top to bottom, one
 * card per stage that left one.
 */
export function RecordLedger({
	row,
	record,
}: {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
}): React.JSX.Element {
	const nowMs = useNow(row.progress.state === "running");

	return (
		<section
			aria-label="Record ledger"
			className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-10"
		>
			<div className="flex max-w-250 flex-col gap-3">
				{record.stages.map((stage, index) =>
					stage.status === "no-record" ? null : (
						<LedgerCard
							key={stage.stage}
							row={row}
							record={record}
							stage={stage}
							number={index + 1}
							nowMs={nowMs}
						/>
					),
				)}
			</div>
		</section>
	);
}
