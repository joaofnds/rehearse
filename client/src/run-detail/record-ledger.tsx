import { useQuery } from "@tanstack/react-query";
import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import {
	BlockerLine,
	blockerState,
	DimensionLine,
	Label,
} from "#client/monitor/judged-items";
import type { JudgedAnswer } from "#client/monitor/judged-items";
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
import { unjudgedReading } from "./step-report";

const LINE_COUNT = new Intl.NumberFormat("en-US");

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
	readonly judge: StageJudgeResponse | "unreadable" | undefined;
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
	const status = cardStatus(stage, row, record);
	const stopped = status.state === "stopped";
	const session = useQuery(stageSessionQuery(row.run, stage.stage));
	const judge = useQuery(stageJudgeQuery(row.run, stage.stage));
	const meta = [
		durationReading(stage, row, nowMs),
		costReading(stage, row),
		...linesReading(session.data, session.isError),
	].join(" · ");

	return (
		<article
			aria-label={`Step ${String(number)} · ${stage.stage}`}
			className={`overflow-hidden rounded-card border bg-card ${stopped ? "border-deeper" : "border-border"}`}
		>
			<div
				className={`flex flex-wrap items-center gap-3 border-b border-border px-3.5 py-2.75 ${stopped ? "bg-fired" : "bg-raised"}`}
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
			<CardBody judge={judge.isError ? "unreadable" : judge.data} />
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
