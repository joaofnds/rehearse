import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import { judgeLeftWaiting } from "#client/monitor/run-record-query";
import type { StageJudgeResponse } from "#client/monitor/stage-judge-query";
import { stageJudgeQuery } from "#client/monitor/stage-judge-query";
import { stageSessionQuery } from "#client/monitor/stage-session-query";
import type { PipelineRow } from "#client/shell/run-in-flight";

import PipelineOutput from "./pipeline-output";
import { StepRecordedInputs } from "./step-report-inputs";
import { GradeStat, JudgedSections, VerdictStat } from "./step-report-judgment";
import type { SessionRead } from "./step-report-readings";
import { metaLine } from "./step-report-readings";

/**
 * One stage's report (SPEC.md 4a): what it ran and cost, its grade against
 * the run's minimum, the judge's blockers and dimensions with their cited
 * evidence, and the instructions it read with whether each changed since.
 */
interface StepReportProps {
	readonly run: string;
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
	readonly number: number;
}

function StepReport({
	run,
	row,
	record,
	stage,
	number,
}: StepReportProps): React.JSX.Element {
	const judge = useQuery(stageJudgeQuery(run, stage.stage));
	const session = useQuery(stageSessionQuery(run, stage.stage));
	const leftWaiting = judgeLeftWaiting(record, stage);
	const sessionRead: SessionRead = session.isError
		? "unreadable"
		: (session.data ?? "loading");

	return (
		<section aria-label="Step report" className="min-w-0">
			<div className="mb-4">
				<h2 className="text-16 font-semibold">
					Step {String(number)} · {stage.stage}
				</h2>
				<p className="mt-1 font-mono text-12 text-dim">
					{metaLine(stage, sessionRead)}
				</p>
			</div>
			<div className="grid items-start gap-6 xl:grid-cols-2">
				<PipelineOutput run={run} stage={stage} row={row} record={record} />
				<StepAssessment
					run={run}
					stage={stage}
					row={row}
					record={record}
					judge={judge}
					leftWaiting={leftWaiting}
				/>
			</div>
			<StepRecordedInputs run={run} stage={stage} sessionRead={sessionRead} />
		</section>
	);
}

interface StepAssessmentProps {
	readonly run: string;
	readonly stage: MonitoredStage;
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly judge: StepJudgeReading;
	readonly leftWaiting: boolean;
}

function StepAssessment({
	run,
	stage,
	row,
	record,
	judge,
	leftWaiting,
}: StepAssessmentProps): React.JSX.Element {
	return (
		<section
			aria-label="Selected step assessment"
			className="min-w-0 rounded-lg border border-border bg-card p-6"
		>
			<div className="flex flex-col items-stretch gap-4">
				<h3 className="text-14 font-medium">Step assessment</h3>
				<div className="flex flex-wrap gap-3">
					<GradeStat stage={stage} record={record} />
					<VerdictStat
						stage={stage}
						row={row}
						record={record}
						judge={judge.data}
						leftWaiting={leftWaiting}
					/>
				</div>
			</div>
			<JudgedSections
				run={run}
				stage={stage.stage}
				judge={judge.isError ? "unreadable" : judge.data}
				leftWaiting={leftWaiting}
			/>
		</section>
	);
}

type StepJudgeReading = Readonly<
	Pick<UseQueryResult<StageJudgeResponse>, "data" | "isError">
>;

export { ReadState } from "./step-report-inputs";
export type { ReadEntry } from "./step-report-inputs";
export { unjudgedReading } from "./step-report-judgment";
export {
	HASH_SHOWN,
	LINE_COUNT,
	NO_KEPT_TRANSCRIPT,
	notRecorded,
	skillReading,
	wallTimeReading,
} from "./step-report-readings";
export { StepReport };
