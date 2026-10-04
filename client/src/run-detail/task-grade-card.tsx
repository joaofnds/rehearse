import {
	corpusMeasurementReading,
	corpusVersionLabel,
} from "#benchmark/corpus-version-label";
import type { RunRecordResponse } from "#client/monitor/run-record-query";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { SectionLabel } from "#client/system/components/section-label";

type FinalOutcome = RunRecordResponse["finalOutcome"];

type CorpusMeasurement = PipelineRow["corpusVersion"];

const NOT_RETURNED = "—";

const JUDGE_SCOPE =
	"The task judge sees only what went in at step 1 and what came out of the last step. It does not read the intermediate steps, so it cannot grade a run that stopped early. Step grades below are unaffected.";

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
			return { value: outcome.verdict, note: "graded independently" };
		}
		case "JUDGING_FAILED": {
			return {
				value: NOT_RETURNED,
				note: `judging failed · ${outcome.reason}`,
			};
		}
		case "NOT_REACHED": {
			return { value: NOT_RETURNED, note: `not reached · ${outcome.reason}` };
		}
		case "PENDING": {
			return {
				value: NOT_RETURNED,
				note: `pending · the run is at ${outcome.stage}`,
			};
		}
		default: {
			return outcome satisfies never;
		}
	}
}

type JudgedRow = PipelineRow & {
	readonly finalOutcome: Extract<
		PipelineRow["finalOutcome"],
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
export function lastTaskGrade(
	row: PipelineRow,
	rows: readonly PipelineRow[],
): JudgedRow | undefined {
	return rows
		.filter(
			(other): other is JudgedRow =>
				other.caseId === row.caseId && other.run !== row.run && isJudged(other),
		)
		.toSorted((left, right) => right.run.localeCompare(left.run))[0];
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

function LastTaskGrade({
	row,
	last,
}: {
	readonly row: PipelineRow;
	readonly last: JudgedRow | undefined;
}): React.JSX.Element {
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
			{comparable ? (
				<p className="mt-1 text-11-5 text-dim">
					same corpus · {corpusWords(last.corpusVersion)}
				</p>
			) : (
				<>
					<p className="mt-1 text-11-5 text-bright">
						<span aria-hidden="true">⚠ </span>
						stale · {corpusWords(last.corpusVersion)}
					</p>
					<p className="mt-1 text-11-5 text-dim">
						Not comparable to a {corpusWords(row.corpusVersion)} result.
					</p>
				</>
			)}
		</>
	);
}

/** SPEC.md 4c item 1: the outcome graded on its own, before any culprit. */
export function TaskGradeCard({
	row,
	rows,
	outcome,
}: {
	readonly row: PipelineRow;
	readonly rows: readonly PipelineRow[];
	readonly outcome: FinalOutcome;
}): React.JSX.Element {
	const { value, note } = outcomeReading(outcome);

	return (
		<div className="grid grid-cols-main-aside gap-6 rounded-lg border border-border bg-card p-4.5">
			<section aria-labelledby="task-grade-label">
				<h2 id="task-grade-label">
					<SectionLabel>Task grade · graded on its own</SectionLabel>
				</h2>
				<p className="mt-2 font-mono text-30 font-bold">{value}</p>
				<p className="text-11-5 text-dim">{note}</p>
				<p className="mt-2.5 max-w-prose text-12 text-secondary-foreground">
					{JUDGE_SCOPE}
				</p>
			</section>
			<section
				aria-labelledby="last-task-grade-label"
				className="border-l border-divider pl-5"
			>
				<h2 id="last-task-grade-label">
					<SectionLabel>Last task grade for this case</SectionLabel>
				</h2>
				<LastTaskGrade row={row} last={lastTaskGrade(row, rows)} />
			</section>
		</div>
	);
}
