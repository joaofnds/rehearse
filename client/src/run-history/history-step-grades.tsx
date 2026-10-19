import plural from "#client/plural";

import type { GroupRow } from "./history-comparison-choice";
import type { HistoryRow, RunHistoryRow } from "./history-table-contract";
import { NO_REPORTED_OUTCOMES } from "./history-table-contract";

const NOT_APPLICABLE = "n/a";

const STEP_REPLAY_ONLY = "step replay only";

type StageGrades = RunHistoryRow["stageGrades"];

type StageGrade = Extract<
	StageGrades,
	{ readonly state: "available" }
>["grades"][number]["grade"];

type ReplayRow = Extract<HistoryRow, { readonly kind: "replay" }>;

type PipelineStages = ReplayRow["pipelineStages"];

function reasonsLine(reasons: readonly string[]): React.JSX.Element {
	return <span className="text-12 text-dim">{reasons.join("; ")}</span>;
}

interface StepGradeReadingsProps {
	readonly readings: readonly {
		readonly stage: string;
		readonly value: string;
		readonly measured: boolean;
		readonly reason?: string | undefined;
	}[];
}

function StepGradeReadings({
	readings,
}: StepGradeReadingsProps): React.JSX.Element {
	return (
		<dl className="flex flex-col gap-2">
			{readings.map(({ stage, value, measured, reason }) => (
				<div
					key={stage}
					className="flex min-w-0 items-baseline justify-between gap-2"
				>
					<dt className="min-w-0 text-12 wrap-anywhere text-secondary-foreground">
						{stage}
					</dt>
					<dd
						title={reason}
						className={
							measured
								? "rounded-sm border border-divider bg-raised px-2 py-0.5 font-mono text-14 font-medium"
								: "max-w-24 text-right text-12 text-dim"
						}
					>
						{value}
					</dd>
				</div>
			))}
		</dl>
	);
}

function runStepGrades(stageGrades: StageGrades): React.JSX.Element {
	if (stageGrades.state === "unavailable") {
		return reasonsLine(stageGrades.reasons);
	}

	const readings = stageGrades.grades.map(({ stage, status, grade }) => {
		if (grade.state === "available") {
			return { measured: true, reason: undefined, stage, value: grade.letter };
		}

		let value = "No grade";
		if (status === "not-run") {
			value = "Not run";
		} else if (status === "awaiting-judgment") {
			value = "Awaiting judge";
		}

		return { measured: false, reason: grade.reasons.join("; "), stage, value };
	});

	return <StepGradeReadings readings={readings} />;
}

function gradeTokens(text: string): React.JSX.Element {
	return (
		<span className="font-mono text-12 tracking-caps whitespace-normal">
			{text}
		</span>
	);
}

function placedGrades(
	stages: PipelineStages,
	tokens: ReadonlyMap<string, string | undefined>,
	absent: string,
): React.JSX.Element {
	const names =
		stages.state === "available" ? stages.stages : [...tokens.keys()];
	const readings = names.map((stage) => {
		const value = tokens.get(stage);
		const missing = tokens.has(stage) ? "No grade" : absent;

		return { measured: value !== undefined, stage, value: value ?? missing };
	});

	return (
		<span className="flex flex-col gap-2">
			<StepGradeReadings readings={readings} />
			{stages.state === "unavailable" ? reasonsLine(stages.reasons) : null}
		</span>
	);
}

function groupMedians(row: GroupRow): ReadonlyMap<string, string | undefined> {
	return new Map(
		row.stageSummaries.map(({ stage, graded, grades }) => [
			stage,
			grades.state === "available"
				? `${grades.median} · ${String(graded)} graded`
				: undefined,
		]),
	);
}

function recordedReps(row: GroupRow): number {
	return Object.values(row.finalOutcomes).reduce(
		(sum, count) => sum + count,
		NO_REPORTED_OUTCOMES,
	);
}

function groupStepGrades(row: GroupRow): React.JSX.Element {
	if (row.mode === "session") {
		const recorded = recordedReps(row);
		const passed = (
			<span className="flex flex-col gap-1">
				<span className="text-12 text-muted-foreground">
					Reply/transcript basis
				</span>
				{gradeTokens(
					`${String(row.successful)}/${String(recorded)} recorded successful`,
				)}
			</span>
		);
		if (recorded === row.reps) {
			return passed;
		}

		return (
			<span className="flex flex-col gap-0.5">
				{passed}
				{reasonsLine([
					`${String(row.reps - recorded)} of ${plural(row.reps, "rep")} not recorded`,
				])}
			</span>
		);
	}

	return (
		<span className="flex flex-col gap-2">
			<span className="text-12 text-muted-foreground">Median grades</span>
			{placedGrades(
				row.pipelineStages,
				groupMedians(row),
				row.mode === "stage" ? "Not included" : "No grade",
			)}
		</span>
	);
}

export {
	gradeTokens,
	groupStepGrades,
	NOT_APPLICABLE,
	placedGrades,
	reasonsLine,
	recordedReps,
	runStepGrades,
	STEP_REPLAY_ONLY,
};
export type { ReplayRow, StageGrade, StageGrades };
