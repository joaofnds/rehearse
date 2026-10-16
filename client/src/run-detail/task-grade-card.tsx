import {
	corpusMeasurementReading,
	corpusVersionLabel,
} from "#benchmark/corpus-version-label";
import type { RunRecordResponse } from "#client/monitor/run-record-query";
import { EvidenceDialogLink } from "#client/evidence/evidence-dialog";
import type { FinalAssessmentResponse } from "./investigation-query";
import type { PipelineRowWithStaleness } from "#client/run-history/run-history-query";
import { SectionLabel } from "#client/system/components/section-label";
import { Status } from "#client/system/components/status";

import type { PipelineRow } from "#client/shell/run-in-flight";

type FinalOutcome = RunRecordResponse["finalOutcome"];

type CorpusMeasurement = PipelineRowWithStaleness["corpusVersion"];

export const NOT_RETURNED = "—";

export const JUDGED_NOTE = "graded independently";

const JUDGE_SCOPE =
	"The task judge sees only what went in at step 1 and what came out of the last step. It does not read the intermediate steps, so it cannot grade a run that stopped early. Step grades below are unaffected.";

export interface OutcomeReading {
	readonly value: string;
	readonly note: string;
}

/**
 * The final judge returns PASS or FAIL and no letter (decision-5), so the
 * value is its verdict or a dash with the reason it has none.
 */
export function outcomeReading(outcome: FinalOutcome): OutcomeReading {
	switch (outcome.status) {
		case "JUDGED": {
			return { value: outcome.verdict, note: JUDGED_NOTE };
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
export function lastTaskGrade(
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
			<StalenessReading last={last} />
			<p className="mt-1 text-11-5 text-dim">
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
function StalenessReading({
	last,
}: {
	readonly last: JudgedRow;
}): React.JSX.Element {
	const { staleness } = last;
	const corpus = corpusWords(last.corpusVersion);
	if (staleness.state === "unavailable") {
		return (
			<p className="mt-1 text-11-5 text-dim">
				{corpus} · staleness not judged: {staleness.reasons.join("; ")}
			</p>
		);
	}

	return staleness.stale ? (
		<p className="mt-1 text-11-5 text-bright">
			<Status state="stale" /> · {corpus}
		</p>
	) : (
		<p className="mt-1 text-11-5 text-dim">
			<Status state="clean" /> · {corpus}
		</p>
	);
}

/** SPEC.md 4c item 1: the outcome graded on its own, before any root cause. */
export function TaskGradeCard({
	row,
	rows,
	outcome,
	assessment,
	assessmentError,
	assessmentLoading,
	criteriaOpen,
	onCriteriaOpenChange,
}: {
	readonly row: PipelineRow;
	readonly rows: readonly PipelineRowWithStaleness[];
	readonly outcome: FinalOutcome;
	readonly assessment: FinalAssessmentResponse | undefined;
	readonly assessmentError: boolean;
	readonly assessmentLoading: boolean;
	readonly criteriaOpen: boolean;
	readonly onCriteriaOpenChange: (open: boolean) => void;
}): React.JSX.Element {
	const { value, note } = outcomeReading(outcome);
	const criteria =
		assessment?.state === "available" ? assessment.requirements : [];
	const failed = criteria.filter(({ status }) => status === "FAIL");
	const passed = criteria.filter(({ status }) => status === "PASS");
	const firstFinding = failed[0]?.evidence[0]?.claim;
	const criterion = (
		item: Readonly<(typeof criteria)[number]>,
	): React.JSX.Element => (
		<li
			key={item.id}
			className="min-w-0 rounded-md border border-divider p-3 text-13"
		>
			<p className="font-medium">
				{item.status} · {item.id}
			</p>
			{item.evidence.map((evidence, index) => (
				<div key={index} className="mt-2">
					<p>{evidence.claim}</p>
					{evidence.quote === undefined ? null : (
						<blockquote className="mt-2 border-l-2 border-accent-line pl-3 font-mono text-12 whitespace-pre-wrap wrap-anywhere">
							{evidence.quote}
						</blockquote>
					)}
					<EvidenceDialogLink
						identity={{
							kind: "final",
							run: row.run,
							item: item.id,
							index: String(index),
						}}
					>
						<span className="mt-1 inline-block text-11-5 text-pale underline">
							{evidence.place ?? `${evidence.path} · open cited source`}
						</span>
					</EvidenceDialogLink>
				</div>
			))}
		</li>
	);
	let missingCriteria = "No final criteria were recorded.";
	if (assessmentError) {
		missingCriteria = "Could not read the saved final criteria.";
	} else if (assessment?.state === "unavailable") {
		missingCriteria = assessment.reason;
	} else if (assessmentLoading) {
		missingCriteria = "Reading saved final criteria…";
	}

	return (
		<div className="rounded-lg border border-border bg-card p-5">
			<section aria-labelledby="task-grade-label">
				<h2 id="task-grade-label">
					<SectionLabel>Final outcome · independent task Judge</SectionLabel>
				</h2>
				<div className="mt-2 flex flex-wrap items-baseline gap-3">
					<p className="font-mono text-24 font-medium">{value}</p>
					<p className="text-12 text-dim">{note}</p>
				</div>
				{assessment?.state === "available" &&
				assessment.summary !== undefined ? (
					<p className="mt-2 text-13 text-secondary-foreground">
						{assessment.summary}
					</p>
				) : null}
				{failed.length === 0 ? null : (
					<>
						<p className="mt-2 text-13">
							{failed.length} of {criteria.length} final criteria failed ·{" "}
							{failed.map(({ id }) => id).join(", ")}
						</p>
						{firstFinding === undefined ? null : (
							<p className="mt-2 text-13 text-secondary-foreground">
								{firstFinding}
							</p>
						)}
						<details
							id="final-criteria"
							tabIndex={-1}
							className="mt-3"
							open={criteriaOpen}
							onToggle={(event) => {
								onCriteriaOpenChange(event.currentTarget.open);
							}}
						>
							<summary className="cursor-pointer text-12 text-pale">
								All {failed.length} failed criteria &amp; citations
							</summary>
							<ul
								aria-label="Failed final criteria"
								className="mt-3 grid gap-2"
							>
								{failed.map((item) => criterion(item))}
							</ul>
						</details>
					</>
				)}
				{passed.length === 0 ? null : (
					<details className="mt-3">
						<summary className="cursor-pointer text-12 text-muted-foreground">
							{passed.length} passed final criteria
						</summary>
						<ul className="mt-2 grid gap-2">
							{passed.map((item) => criterion(item))}
						</ul>
					</details>
				)}
				{outcome.status === "JUDGED" && criteria.length === 0 ? (
					<p className="mt-2 text-12 text-dim">{missingCriteria}</p>
				) : null}
				<details className="mt-3">
					<summary className="cursor-pointer text-12 text-muted-foreground">
						How final grading works
					</summary>
					<p className="mt-2 max-w-prose text-12 text-secondary-foreground">
						{JUDGE_SCOPE}
					</p>
				</details>
			</section>
			<details className="mt-3 border-t border-divider pt-3">
				<summary className="cursor-pointer text-12 text-muted-foreground">
					Previous task result
				</summary>
				<section aria-labelledby="last-task-grade-label" className="pt-3">
					<h2 id="last-task-grade-label">
						<SectionLabel>Last task grade for this case</SectionLabel>
					</h2>
					<LastTaskGrade row={row} last={lastTaskGrade(row, rows)} />
				</section>
			</details>
		</div>
	);
}
