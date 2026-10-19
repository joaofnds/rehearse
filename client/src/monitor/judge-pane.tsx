import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { LiveGlyph } from "#client/system/components/status";

import {
	GRADE_NOT_RECORDED,
	judgeMeta,
	judgedItems,
	judgedVerdict,
	pendingPhrase,
	pendingVerdict,
	returningItems,
} from "./judge-reading-model";
import JudgedBody from "./judge-result-body";
import PendingLine from "./pending-line";
import type { MonitoredStage, RunRecordResponse } from "./run-record-query";
import { hasEnded, runRecordQuery } from "./run-record-query";
import type { StageJudgeResponse } from "./stage-judge-query";
import { stageJudgeQuery } from "./stage-judge-query";

/**
 * The judge pane (SPEC.md 2d): the stage judge's verdict and grade, its hard
 * blockers and quality dimensions as each returns, the evidence each cites
 * once the record holds it, and the reminder that one grade is one attempt.
 */
interface JudgePaneProps {
	readonly run: string;
	readonly number: number;
	readonly figures: MonitoredStage;
}

function JudgePane({
	run,
	number,
	figures,
}: JudgePaneProps): React.JSX.Element {
	const { stage } = figures;
	const { data, isError } = useQuery(stageJudgeQuery(run, stage));
	const record = useQuery(runRecordQuery(run));
	const meta = data === undefined ? undefined : judgeMeta(data, figures);
	const client = useQueryClient();
	const lagging = data?.state === "judged" && !hasEnded(figures);
	useEffect(() => {
		// The record the judge read was written with no run event behind it, so
		// the run record is read again once rather than waiting for one.
		if (lagging) {
			void client.invalidateQueries({ queryKey: runRecordQuery(run).queryKey });
		}
	}, [client, lagging, run]);

	return (
		<section
			aria-label="Judge"
			className="flex min-h-0 min-w-0 flex-col bg-secondary"
		>
			<JudgeHeading
				number={number}
				returning={data?.state === "returning"}
				meta={meta}
			/>
			<JudgeReadings
				run={run}
				stage={stage}
				data={data}
				isError={isError}
				figures={figures}
				minimumGrade={record.data?.minimumGrade}
			/>
		</section>
	);
}

interface JudgeHeadingProps {
	readonly number: number;
	readonly returning: boolean;
	readonly meta: string | undefined;
}

function JudgeHeading({
	number,
	returning,
	meta,
}: JudgeHeadingProps): React.JSX.Element {
	return (
		<div className="flex flex-none flex-wrap items-center gap-2.75 border-b border-divider px-4.25 py-2.75">
			<h2 className="text-16 font-semibold tracking-caps text-muted-foreground uppercase">
				Judge · step {String(number)}
			</h2>
			{returning ? (
				<>
					<span className="text-12">
						<LiveGlyph />
					</span>
					<span className="text-12 text-accent-foreground">grading</span>
				</>
			) : null}
			{meta === undefined ? null : (
				<span className="ml-auto font-mono text-12 text-dim">{meta}</span>
			)}
		</div>
	);
}

interface JudgeReadingsProps {
	readonly run: string;
	readonly stage: string;
	readonly data: StageJudgeResponse | undefined;
	readonly isError: boolean;
	readonly figures: MonitoredStage;
	readonly minimumGrade: RunRecordResponse["minimumGrade"] | undefined;
}

function JudgeReadings({
	run,
	stage,
	data,
	isError,
	figures,
	minimumGrade,
}: JudgeReadingsProps): React.JSX.Element {
	return (
		<div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain px-4.25 pt-3.75 pb-6">
			{isError ? (
				<p role="alert" className="text-14 text-attention">
					<span aria-hidden="true">⚠ </span>
					Could not read this step's judge.
				</p>
			) : null}
			{data?.state === "waiting" ? (
				<PendingLine words="This step's judge has not started yet." />
			) : null}
			{data?.state === "not-judged" ? (
				<PendingLine words="This step ended without a judged grade, so there is no verdict to show." />
			) : null}
			{data?.state === "returning" ? (
				<JudgedBody
					run={run}
					stage={stage}
					verdict={pendingVerdict(pendingPhrase(data.progress))}
					items={
						data.progress === undefined
							? undefined
							: returningItems(data.progress)
					}
				/>
			) : null}
			{data?.state === "judged" ? (
				<JudgedBody
					run={run}
					stage={stage}
					verdict={
						// The run record can lag the judge's answer by one read.
						hasEnded(figures)
							? judgedVerdict(data, figures, minimumGrade)
							: pendingVerdict(GRADE_NOT_RECORDED)
					}
					items={judgedItems(data)}
				/>
			) : null}
		</div>
	);
}

export { JudgePane as default };
