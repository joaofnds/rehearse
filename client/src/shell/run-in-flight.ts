import {
	isStopped,
	OPERATOR_STOPPED,
	stoppedStageOf,
} from "#benchmark/stopped-status";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { spendReading } from "#client/run-history/run-progress";

type HistoryRow = RunHistoryResponse["rows"][number];
export type PipelineRow = Extract<HistoryRow, { readonly kind: "run" }>;

/**
 * The share of a run's ceiling at which the operator hears that it is close.
 * No source sets the figure: it is the recommendation doc-186 records as
 * unsettled for the operator.
 */
const CEILING_APPROACHED_SHARE = 0.8;

/** Pipeline runs in flight, newest first, which a run's timestamped id orders. */
export function runsInFlight(
	rows: readonly HistoryRow[],
): readonly PipelineRow[] {
	return rows
		.filter(
			(row): row is PipelineRow =>
				row.kind === "run" && row.progress.state === "running",
		)
		.toSorted((left, right) => right.run.localeCompare(left.run));
}

export interface Step {
	readonly number: number;
	readonly of: number;
}

/** Where the stage now running sits in the run's pipeline, when both are known. */
export function stepOf(row: PipelineRow): Step | undefined {
	if (row.progress.state !== "running") {
		return undefined;
	}

	return stepNamed(row, row.progress.stage);
}

function stepNamed(row: PipelineRow, stage: string): Step | undefined {
	if (row.stageGrades.state === "unavailable") {
		return undefined;
	}

	const index = row.stageGrades.grades.findIndex(
		(grade) => grade.stage === stage,
	);

	return index === -1
		? undefined
		: { number: index + 1, of: row.stageGrades.grades.length };
}

/** The letters of the stages graded so far, in pipeline order. */
export function gradesSoFar(row: PipelineRow): readonly string[] {
	if (row.stageGrades.state === "unavailable") {
		return [];
	}

	return row.stageGrades.grades.flatMap(({ grade }) =>
		grade.state === "available" ? [grade.letter] : [],
	);
}

function nameOf(row: PipelineRow): string {
	return row.shortId ?? row.run;
}

function stepWords(step: Step | undefined): string {
	return step === undefined
		? ""
		: ` step ${String(step.number)} of ${String(step.of)}`;
}

function acceptedStages(
	before: PipelineRow,
	after: PipelineRow,
): readonly string[] {
	if (after.stageGrades.state === "unavailable") {
		return [];
	}

	const acceptedBefore = new Set(
		before.stageGrades.state === "available"
			? before.stageGrades.grades
					.filter(({ grade }) => grade.state === "available")
					.map(({ stage }) => stage)
			: [],
	);

	return after.stageGrades.grades.flatMap(({ stage, grade }) =>
		grade.state === "available" &&
		grade.verdict === "PASS" &&
		!acceptedBefore.has(stage)
			? [
					`${nameOf(after)}${stepWords(stepNamed(after, stage))} accepted: ${stage} ${grade.letter}`,
				]
			: [],
	);
}

function stopWords(after: PipelineRow): readonly string[] {
	if (isStopped(after.status)) {
		const stage = stoppedStageOf(after.status);

		return [
			`${nameOf(after)} stopped at${stepWords(stepNamed(after, stage))}: ${stage}`,
		];
	}
	if (after.status === OPERATOR_STOPPED) {
		return [`${nameOf(after)} stopped by the operator`];
	}

	return [];
}

interface CeilingSpend {
	readonly runSpentUsd: number;
	readonly ceilingUsd: number;
}

/** The run's spend and ceiling once the spend has reached the approached share. */
function approachedCeiling(row: PipelineRow): CeilingSpend | undefined {
	if (row.progress.state !== "running") {
		return undefined;
	}

	const { runSpentUsd, ceilingUsd } = row.progress;
	if (runSpentUsd === undefined || ceilingUsd === undefined) {
		return undefined;
	}

	return runSpentUsd >= ceilingUsd * CEILING_APPROACHED_SHARE
		? { runSpentUsd, ceilingUsd }
		: undefined;
}

function ceilingWords(
	before: PipelineRow,
	after: PipelineRow,
): readonly string[] {
	const reached = approachedCeiling(after);
	if (reached === undefined || approachedCeiling(before) !== undefined) {
		return [];
	}

	return [
		`${nameOf(after)} has spent ${spendReading(reached.runSpentUsd)} of its ${spendReading(reached.ceilingUsd)} ceiling`,
	];
}

/**
 * What a screen reader is told between two readings of the run history: a
 * stage accepted, a run stopped, and a run's spend first reaching the share of
 * its ceiling that counts as approaching it. Only runs the earlier reading had
 * in flight are spoken of, so a page opened on finished history says nothing,
 * and a spend change with none of these says nothing either.
 */
export function announcements(
	before: readonly HistoryRow[],
	after: readonly HistoryRow[],
): readonly string[] {
	const earlier = new Map(runsInFlight(before).map((row) => [row.run, row]));

	return after.flatMap((row) => {
		if (row.kind !== "run") {
			return [];
		}

		const previous = earlier.get(row.run);
		if (previous === undefined) {
			return [];
		}

		return [
			...acceptedStages(previous, row),
			...stopWords(row),
			...ceilingWords(previous, row),
		];
	});
}
