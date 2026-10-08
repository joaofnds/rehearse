import { gradeStep } from "#benchmark/stage-letter-grades";
import type { RunListingResponse } from "#client/run-history/run-history-query";

type HistoryRow = RunListingResponse["rows"][number];
type PipelineRow = Extract<HistoryRow, { readonly kind: "run" }>;

const STEP_WORDS = ["one", "two", "three", "four"] as const;

function versionDigest(row: PipelineRow): string | undefined {
	return row.corpusChangedDuringRun || row.corpusVersion?.kind !== "version"
		? undefined
		: row.corpusVersion.digest;
}

/** Where a run's grade for the stage sits in the letter order, best first. */
function letterStep(row: PipelineRow, stage: string): number | undefined {
	if (row.stageGrades.state !== "available") {
		return undefined;
	}
	const grade = row.stageGrades.grades.find(
		(listed) => listed.stage === stage,
	)?.grade;
	if (grade?.state !== "available") {
		return undefined;
	}

	return gradeStep(grade.letter);
}

/**
 * The variance note's measurement (SPEC.md 2d): how far this stage's grade
 * has moved across the other recorded runs of the same case under the same
 * corpus version, in letter steps. A run whose corpus changed while it ran is
 * no identical rerun, and with fewer than two grades nothing is measured.
 */
export function rerunSpreadSentence(
	rows: readonly HistoryRow[],
	watched: { readonly run: string; readonly stage: string },
): string {
	const current = rows.find(
		(row): row is PipelineRow => row.kind === "run" && row.run === watched.run,
	);
	const digest = current === undefined ? undefined : versionDigest(current);
	const steps =
		current === undefined || digest === undefined
			? []
			: rows
					.filter(
						(row): row is PipelineRow =>
							row.kind === "run" &&
							row.run !== watched.run &&
							row.caseId === current.caseId &&
							versionDigest(row) === digest,
					)
					.flatMap((row) => letterStep(row, watched.stage) ?? []);
	if (steps.length < 2) {
		return "Fewer than two identical reruns of this case have graded this step, so how far its grade varies here is not known yet.";
	}

	const spread = Math.max(...steps) - Math.min(...steps);
	if (spread === 0) {
		return "Identical reruns of this case have not varied here.";
	}

	return `Identical reruns of this case have varied by ${STEP_WORDS[spread - 1] ?? String(spread)} letter ${spread === 1 ? "step" : "steps"} here.`;
}
