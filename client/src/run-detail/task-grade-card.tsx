import {
	corpusMeasurementReading,
	corpusVersionLabel,
} from "#benchmark/corpus-version-label";
import type { RunRecordResponse } from "#client/monitor/run-record-query";
import type { PipelineRowWithStaleness } from "#client/run-history/run-history-query";
import type { PipelineRow } from "#client/shell/run-in-flight";
import SectionLabel from "#client/system/components/section-label";
import { Status } from "#client/system/components/status";
import SummaryPanel from "#client/system/components/summary-panel";

import type { FinalAssessmentResponse } from "./investigation-query";
import FinalAssessmentReadings from "./task-final-criteria";

const LATEST_OTHER_RUN_INDEX = 0;

type FinalOutcome = RunRecordResponse["finalOutcome"];

type CorpusMeasurement = PipelineRowWithStaleness["corpusVersion"];

const NOT_RETURNED = "—";

const JUDGED_NOTE = "graded independently";

interface OutcomeReading {
	readonly value: string;
	readonly note: string;
}

/**
 * The final judge returns PASS or FAIL and no letter (decision-5), so the
 * value is its verdict or a dash with the reason it has none.
 */
function outcomeReading(outcome: FinalOutcome): OutcomeReading {
	switch (outcome.status) {
		case "JUDGED": {
			return { note: JUDGED_NOTE, value: outcome.verdict };
		}
		case "JUDGING_FAILED": {
			return {
				note: `judging failed · ${outcome.reason}`,
				value: NOT_RETURNED,
			};
		}
		case "NOT_REACHED": {
			return { note: `not reached · ${outcome.reason}`, value: NOT_RETURNED };
		}
		case "PENDING": {
			return {
				note: `pending · the run is at ${outcome.stage}`,
				value: NOT_RETURNED,
			};
		}
		default: {
			return outcome satisfies never;
		}
	}
}

type JudgedRow = PipelineRowWithStaleness & {
	readonly finalOutcome: Extract<
		PipelineRowWithStaleness["finalOutcome"],
		{ readonly status: "JUDGED" }
	>;
};

function isJudged(row: PipelineRow): row is JudgedRow {
	return (
		row.finalOutcome.state === "available" &&
		row.finalOutcome.status === "JUDGED"
	);
}

/** The newest other run of the same case whose final judge returned a verdict. */
function lastTaskGrade(
	row: PipelineRow,
	rows: readonly PipelineRowWithStaleness[],
): JudgedRow | undefined {
	return rows
		.filter(
			(other): other is JudgedRow =>
				other.caseId !== undefined &&
				other.caseId === row.caseId &&
				other.run !== row.run &&
				isJudged(other),
		)
		.toSorted((left, right) => right.run.localeCompare(left.run))[
		LATEST_OTHER_RUN_INDEX
	];
}

function digestOf(measurement: CorpusMeasurement): string | undefined {
	return measurement?.kind === "version" ? measurement.digest : undefined;
}

function corpusWords(measurement: CorpusMeasurement): string {
	const digest = digestOf(measurement);

	return digest === undefined
		? corpusMeasurementReading(measurement)
		: corpusVersionLabel(digest);
}

interface LastTaskGradeProps {
	readonly row: PipelineRow;
	readonly last: JudgedRow | undefined;
}

function LastTaskGrade({ row, last }: LastTaskGradeProps): React.JSX.Element {
	if (last === undefined) {
		return (
			<p className="mt-2 text-12 text-muted-foreground">
				No other run of this case has a task grade yet.
			</p>
		);
	}

	const digest = digestOf(last.corpusVersion);
	const comparable =
		digest !== undefined && digest === digestOf(row.corpusVersion);

	return (
		<>
			<p className="mt-2 flex items-baseline gap-2.5">
				<span className="font-mono text-19 font-bold">
					{last.finalOutcome.verdict}
				</span>
				<span className="font-mono text-12">{last.shortId ?? last.run}</span>
			</p>
			<StalenessReading last={last} />
			<p className="mt-1 text-12 text-dim">
				{comparable
					? "same corpus as this run"
					: `Not comparable to a ${corpusWords(row.corpusVersion)} result.`}
			</p>
		</>
	);
}

/**
 * Whether the last task grade still measures the corpus under test, as the
 * server judged its record for run history.
 */
interface StalenessReadingProps {
	readonly last: JudgedRow;
}

function StalenessReading({ last }: StalenessReadingProps): React.JSX.Element {
	const { staleness } = last;
	const corpus = corpusWords(last.corpusVersion);
	if (staleness.state === "unavailable") {
		return (
			<p className="mt-1 text-12 text-dim">
				{corpus} · staleness not judged: {staleness.reasons.join("; ")}
			</p>
		);
	}

	return staleness.stale ? (
		<p className="mt-1 text-12 text-bright">
			<Status state="stale" /> · {corpus}
		</p>
	) : (
		<p className="mt-1 text-12 text-dim">
			<Status state="clean" /> · {corpus}
		</p>
	);
}

/** SPEC.md 4c item 1: the outcome graded on its own, before any root cause. */
interface TaskGradeCardProps {
	readonly row: PipelineRow;
	readonly rows: readonly PipelineRowWithStaleness[];
	readonly outcome: FinalOutcome;
	readonly assessment: FinalAssessmentResponse | undefined;
	readonly assessmentError: boolean;
	readonly assessmentLoading: boolean;
	readonly criteriaOpen: boolean;
	readonly onCriteriaOpenChange: (open: boolean) => void;
}

function TaskGradeCard(request: TaskGradeCardProps): React.JSX.Element {
	const reading = outcomeReading(request.outcome);
	return (
		<SummaryPanel
			id="task-grade-label"
			title="Final outcome · independent task Judge"
			className={
				reading.value === "FAIL" ? "border-l-4 border-l-negative bg-card" : ""
			}
		>
			<FinalAssessmentReadings request={request} reading={reading} />
			<details className="mt-3 border-t border-divider pt-3">
				<summary className="cursor-pointer text-14 text-muted-foreground">
					Previous task result
				</summary>
				<section aria-labelledby="last-task-grade-label" className="pt-3">
					<h2 id="last-task-grade-label">
						<SectionLabel>Last task grade for this case</SectionLabel>
					</h2>
					<LastTaskGrade
						row={request.row}
						last={lastTaskGrade(request.row, request.rows)}
					/>
				</section>
			</details>
		</SummaryPanel>
	);
}

export {
	JUDGED_NOTE,
	lastTaskGrade,
	NOT_RETURNED,
	outcomeReading,
	TaskGradeCard,
};
export type { FinalOutcome, OutcomeReading, TaskGradeCardProps };
