import { STAGE_LETTER_GRADES } from "#benchmark/config";
import type { StageLetterGrade } from "#benchmark/config";
import type {
	ComparisonArm,
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import type { ReliabilitySummary } from "#benchmark/confirmation-report";
import type { OutputWords } from "#benchmark/output-words";
import type { QualityScale } from "./comparison-quality-reading";
import {
	letterRange,
	NO_GRADED_REP_REASON,
} from "./confirmation-group-summary";
import type { LetterRange } from "./confirmation-group-summary";
import type { Reading } from "./run-record";

type AnyComparisonReport = ComparisonReport | LegacyComparisonReport;
type ReportArm = AnyComparisonReport["cases"][number]["arms"][ComparisonArm];

/**
 * A stage arm reads as letters. A pass/fail measure, a session's checks or a
 * pipeline's final verdict, carries no letter and reads as successes.
 */
export type MeasureFigure =
	| { readonly scale: "letters"; readonly grades: Reading<LetterRange> }
	| {
			readonly scale: "successRate";
			readonly successful: number;
			readonly attempts: number;
	  };

export type ArmCost = Reading<{
	readonly totalUsd: number;
	readonly perAttemptUsd: number;
}>;

/**
 * `attempts` beside `counted` because an attempt with no output, a failed
 * session or a diff-only stage, leaves the average over fewer attempts than
 * the arm holds.
 */
export type ArmWords = Reading<{
	readonly averageWords: number;
	readonly counted: number;
	readonly attempts: number;
}>;

export interface ArmFigures {
	readonly measures: Readonly<Record<string, MeasureFigure>>;
	readonly cost: ArmCost;
	readonly words: ArmWords;
}

export const NO_RECORDED_WORDS_REASON =
	"this report records no word count for its attempts";

function isLetter(grade: string): grade is StageLetterGrade {
	return STAGE_LETTER_GRADES.some((letter) => letter === grade);
}

function gradesOf(summary: ReliabilitySummary): StageLetterGrade[] {
	return Object.entries(summary.gradeDistribution).flatMap(([grade, count]) =>
		isLetter(grade) ? Array.from({ length: count }, () => grade) : [],
	);
}

function measureFigure(
	summary: ReliabilitySummary,
	scale: QualityScale,
): MeasureFigure {
	if (scale === "successRate") {
		return {
			scale,
			successful: summary.successful,
			attempts: summary.requested,
		};
	}

	const range = letterRange(gradesOf(summary));

	return {
		scale,
		grades:
			range === undefined
				? { state: "unavailable", reasons: [NO_GRADED_REP_REASON] }
				: { state: "available", ...range },
	};
}

function armCost(resources: ReportArm["resources"]): ArmCost {
	if (resources.status === "UNAVAILABLE") {
		return {
			state: "unavailable",
			reasons: resources.missingEvidence.map(
				({ repId, missing }) => `${repId} lacks ${missing.join(", ")}`,
			),
		};
	}

	const { values, mean } = resources.total.costUsd;

	return {
		state: "available",
		totalUsd: values.reduce((sum, value) => sum + value, 0),
		perAttemptUsd: mean,
	};
}

type ReportRep = ReportArm["source"]["reps"][number];

function recordedWords(rep: ReportRep): OutputWords | undefined {
	return "words" in rep ? rep.words : undefined;
}

function armWords(reps: readonly ReportRep[]): ArmWords {
	const recorded = reps.flatMap((rep) => {
		const words = recordedWords(rep);

		return words === undefined ? [] : [{ repId: rep.repId, words }];
	});
	if (recorded.length === 0) {
		return { state: "unavailable", reasons: [NO_RECORDED_WORDS_REASON] };
	}

	const counts = recorded.flatMap(({ words }) =>
		words.state === "available" ? [words.words] : [],
	);
	if (counts.length === 0) {
		return {
			state: "unavailable",
			reasons: recorded.flatMap(({ repId, words }) =>
				words.state === "unavailable" ? [`${repId}: ${words.reason}`] : [],
			),
		};
	}

	return {
		state: "available",
		averageWords: counts.reduce((sum, count) => sum + count, 0) / counts.length,
		counted: counts.length,
		attempts: reps.length,
	};
}

export type CaseArmFigures = Readonly<Record<ComparisonArm, ArmFigures>>;

export function armFigures(
	arm: Pick<ReportArm, "quality" | "source" | "resources">,
	scaleFor: (measure: string) => QualityScale,
): ArmFigures {
	return {
		measures: Object.fromEntries(
			arm.quality.map((summary) => [
				summary.name,
				measureFigure(summary, scaleFor(summary.name)),
			]),
		),
		cost: armCost(arm.resources),
		words: armWords(arm.source.reps),
	};
}
