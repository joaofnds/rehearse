import type { DimensionRow, JudgedAnswer } from "#client/monitor/judged-items";
import {
	BlockerRows,
	DimensionRows,
	Label,
	blockerState,
} from "#client/monitor/judged-items";
import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import type { StageJudgeResponse } from "#client/monitor/stage-judge-query";
import { nodeStatus } from "#client/monitor/task-graph";
import plural from "#client/plural";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { Grade } from "#client/system/components/grade";
import { Status } from "#client/system/components/status";

import { SectionTitle, notRecorded } from "./step-report-readings";

const FIRST_SUPPORTING_EVIDENCE_INDEX = 0;

const EMPTY_COLLECTION_LENGTH = 0;

interface StatCardProps {
	readonly label: string;
	readonly children: React.ReactNode;
}

function StatCard({ label, children }: StatCardProps): React.JSX.Element {
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

interface GradeStatProps {
	readonly stage: MonitoredStage;
	readonly record: RunRecordResponse;
}

function GradeStat({ stage, record }: GradeStatProps): React.JSX.Element {
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
			<div className="text-12 text-muted-foreground">
				{grade.state === "unavailable" ? (
					<div>{notRecorded("grade", grade.reasons)}</div>
				) : null}
				<div>
					{record.minimumGrade.state === "available"
						? `min ${record.minimumGrade.letter}`
						: notRecorded("minimum", record.minimumGrade.reasons)}
				</div>
			</div>
		</StatCard>
	);
}

const ENDED_AWAITING = "the run ended while this stage awaited judgment";

function firedReading(
	judge: StageJudgeResponse | undefined,
	leftWaiting: boolean,
): string {
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

	return leftWaiting
		? notRecorded("blockers", [ENDED_AWAITING])
		: "blockers pending";
}

interface VerdictStatProps {
	readonly stage: MonitoredStage;
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly judge: StageJudgeResponse | undefined;
	readonly leftWaiting: boolean;
}

function VerdictStat({
	stage,
	row,
	record,
	judge,
	leftWaiting,
}: VerdictStatProps): React.JSX.Element {
	let status = nodeStatus(stage, row, record);
	if (stage.status === "awaiting-judgment") {
		status = leftWaiting
			? { state: "interrupted", words: "judge never returned" }
			: { state: "pending", words: "awaiting judgment" };
	}
	const { state } = status;

	return (
		<StatCard label="Verdict">
			<div className="mt-1.25 flex items-center justify-end gap-1.75 text-14">
				<Status
					state={state}
					label={status.words}
					tone={state === "accepted" ? "positive" : undefined}
				/>
			</div>
			<div className="text-12 text-muted-foreground">
				{firedReading(judge, leftWaiting)}
			</div>
		</StatCard>
	);
}

function notedDimensions(judge: JudgedAnswer): readonly DimensionRow[] {
	return judge.dimensions.map(({ id, grade, evidence }) => ({
		evidence,
		grade,
		id,
		note: evidence[FIRST_SUPPORTING_EVIDENCE_INDEX]?.claim,
	}));
}

function unjudgedReading(
	judge: Exclude<StageJudgeResponse, JudgedAnswer> | "unreadable",
	leftWaiting: boolean,
): string {
	if (judge === "unreadable") {
		return "Could not read this step's judge.";
	}

	if (judge.state === "not-judged") {
		return "This step ended without a judged grade, so there are no blockers or dimensions to show.";
	}

	return leftWaiting
		? `This step's judge never returned: ${ENDED_AWAITING}.`
		: "This step's judge has not returned its blockers and dimensions yet.";
}

interface JudgedSectionsProps {
	readonly run: string;
	readonly stage: string;
	readonly judge: StageJudgeResponse | "unreadable" | undefined;
	readonly leftWaiting: boolean;
}

function JudgedSections({
	run,
	stage,
	judge,
	leftWaiting,
}: JudgedSectionsProps): React.JSX.Element | null {
	if (judge === undefined) {
		return null;
	}

	if (judge === "unreadable" || judge.state !== "judged") {
		return (
			<p
				className={`mt-4.5 text-14 ${judge === "unreadable" ? "text-attention" : "text-muted-foreground"}`}
			>
				{unjudgedReading(judge, leftWaiting)}
			</p>
		);
	}

	return (
		<div className="min-w-0">
			<SectionTitle>Hard blockers</SectionTitle>
			{judge.hardBlockers.length === EMPTY_COLLECTION_LENGTH ? (
				<p className="mt-2 text-14 text-muted-foreground">
					No hard blocker results were recorded.
				</p>
			) : null}
			<BlockerRows
				run={run}
				stage={stage}
				rows={judge.hardBlockers
					.filter(({ status }) => status === "FAIL")
					.map(({ id, status, evidence }) => ({
						evidence,
						id,
						state: blockerState(status),
					}))}
			/>
			{judge.hardBlockers.some(({ status }) => status === "PASS") ? (
				<ClearStepBlockers run={run} stage={stage} judge={judge} />
			) : null}
			<SectionTitle>Quality dimensions</SectionTitle>
			<DimensionRows run={run} stage={stage} rows={notedDimensions(judge)} />
		</div>
	);
}

interface ClearStepBlockersProps {
	readonly run: string;
	readonly stage: string;
	readonly judge: Extract<StageJudgeResponse, { state: "judged" }>;
}

function ClearStepBlockers({
	run,
	stage,
	judge,
}: ClearStepBlockersProps): React.JSX.Element {
	return (
		<details className="mt-3">
			<summary className="cursor-pointer text-14 text-muted-foreground">
				{plural(
					judge.hardBlockers.filter(({ status }) => status === "PASS").length,
					"clear blocker",
				)}{" "}
				&amp; citations
			</summary>
			<BlockerRows
				label="Clear hard blockers"
				run={run}
				stage={stage}
				rows={judge.hardBlockers
					.filter(({ status }) => status === "PASS")
					.map(({ id, status, evidence }) => ({
						evidence,
						id,
						state: blockerState(status),
					}))}
			/>
		</details>
	);
}

export { GradeStat, JudgedSections, unjudgedReading, VerdictStat };
