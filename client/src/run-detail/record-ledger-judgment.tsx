import { GitCommitHorizontal, RotateCcw } from "lucide-react";

import type { JudgedAnswer, RowEvidence } from "#client/monitor/judged-items";
import {
	BlockerLine,
	DimensionLine,
	EvidenceToggle,
	Label,
	blockerState,
} from "#client/monitor/judged-items";
import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import type { PipelineRow } from "#client/shell/run-in-flight";

import type { JudgeRead } from "./record-ledger-model";
import { checkpointWords } from "./record-ledger-model";
import ReplayButton from "./replay-button";
import { unjudgedReading } from "./step-report";

interface JudgedColumnsProps {
	readonly judge: JudgedAnswer;
}

function JudgedColumns({ judge }: JudgedColumnsProps): React.JSX.Element {
	return (
		<div className="grid min-w-0 grid-cols-1 gap-6 px-3.5 py-2.75 lg:grid-cols-2">
			<div className="min-w-0">
				<Label>Blockers</Label>
				<ul
					aria-label="Hard blockers"
					className="mt-1.5 flex flex-col gap-0.75"
				>
					{judge.hardBlockers.map(({ id, status }) => (
						<li
							key={id}
							className="flex min-w-0 flex-wrap items-center gap-2 py-1"
						>
							<BlockerLine row={{ id, state: blockerState(status) }} />
						</li>
					))}
				</ul>
			</div>
			<div className="min-w-0">
				<Label>Dimensions</Label>
				<ul
					aria-label="Quality dimensions"
					className="mt-1.5 flex flex-col gap-0.75"
				>
					{judge.dimensions.map(({ id, grade }) => (
						<li key={id} className="flex min-w-0 items-center gap-2.5 py-1">
							<DimensionLine row={{ grade, id }} />
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

interface CardBodyProps {
	readonly judge: JudgeRead;
	readonly leftWaiting: boolean;
}

function CardBody({
	judge,
	leftWaiting,
}: CardBodyProps): React.JSX.Element | null {
	if (judge === undefined) {
		return null;
	}

	if (judge !== "unreadable" && judge.state === "judged") {
		return <JudgedColumns judge={judge} />;
	}

	return (
		<p className="px-3.5 py-2.75 text-12 text-muted-foreground">
			{unjudgedReading(judge, leftWaiting)}
		</p>
	);
}

interface CardFooterProps {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
	readonly evidence: RowEvidence | undefined;
	readonly shown: string | undefined;
	readonly onToggle: () => void;
}

function CardFooter({
	row,
	record,
	stage,
	evidence,
	shown,
	onToggle,
}: CardFooterProps): React.JSX.Element {
	const CheckpointIcon =
		stage.checkpoint === "recorded" ? GitCommitHorizontal : RotateCcw;

	return (
		<footer className="flex flex-wrap items-center gap-2.5 border-t border-border px-3.5 py-2.25">
			<span className="flex min-w-0 items-center gap-1.5 font-mono text-12 text-secondary-foreground wrap-anywhere">
				<CheckpointIcon aria-hidden="true" className="size-3 shrink-0" />
				{checkpointWords(stage)}
			</span>
			<span className="ml-auto">
				{evidence === undefined ? null : (
					<EvidenceToggle
						evidence={evidence}
						shown={shown}
						onToggle={onToggle}
					/>
				)}
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

export { CardBody, CardFooter };
