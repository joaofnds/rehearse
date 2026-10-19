import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";

import type { AnalysisReadingResponse } from "./analysis-query";
import type { RunDetailSearch } from "./run-detail-search";
import type { PipelineRow } from "./run-record-readings";
import ResultNextAction from "./run-result-next-action";
import {
	RunAnalysisReview,
	RunHumanReview,
	RunSetupDisclosure,
	WorkflowRecord,
} from "./run-result-reviews";
import { RunStepResult } from "./run-selected-step-actions";
import { TaskGradeCard } from "./task-grade-card";
import useRunResultReadings from "./use-run-result-readings";

interface RunResultsProps {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly search: RunDetailSearch;
	readonly analysis: AnalysisReadingResponse | "unreadable" | undefined;
	readonly analysisInFlight: boolean;
	readonly selected: MonitoredStage | undefined;
	readonly number: number;
}

function RunResults({
	row,
	record,
	search,
	analysis,
	analysisInFlight,
	selected,
	number,
}: RunResultsProps): React.JSX.Element {
	return (
		<div className="flex flex-col gap-6 page-gutter py-8">
			<RunOutcomeActions
				row={row}
				record={record}
				selected={selected}
				number={number}
			/>

			{selected === undefined ? null : (
				<RunStepResult
					row={row}
					record={record}
					selected={selected}
					number={number}
				/>
			)}
			<RunHumanReview row={row} record={record} />
			<RunAnalysisReview
				row={row}
				record={record}
				analysis={analysis}
				analysisInFlight={analysisInFlight}
			/>
			<WorkflowRecord
				row={row}
				record={record}
				analysis={analysis}
				initiallyOpen={search.layout === "ledger" || search.layout === "trace"}
			/>
			{selected === undefined ? null : (
				<RunSetupDisclosure row={row} record={record} selected={selected} />
			)}
		</div>
	);
}

interface RunOutcomeActionsProps {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly selected: MonitoredStage | undefined;
	readonly number: number;
}

function RunOutcomeActions({
	row,
	record,
	selected,
	number,
}: RunOutcomeActionsProps): React.JSX.Element {
	const readings = useRunResultReadings(row, record);
	return (
		<>
			<TaskGradeCard
				row={row}
				rows={readings.rows}
				outcome={record.finalOutcome}
				assessment={readings.assessment.data}
				assessmentError={readings.assessment.isError}
				assessmentLoading={readings.assessment.isLoading}
				criteriaOpen={readings.criteriaOpen}
				onCriteriaOpenChange={readings.setCriteriaOpen}
			/>
			{selected === undefined ? null : (
				<ResultNextAction
					row={row}
					record={record}
					selected={selected}
					number={number}
					finalCitations={readings.finalCitations}
					onInspectFinal={() => {
						readings.setCriteriaOpen(true);
					}}
				/>
			)}
		</>
	);
}

export { RunResults as default };
