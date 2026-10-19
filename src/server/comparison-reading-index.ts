import type { CaseComparisonReading } from "#server/comparison-case-reading";
import type { ComparisonReportWithAttribution } from "#server/comparison-report-contract";

type ComparisonReadingIndex = Required<
	Omit<ComparisonReportWithAttribution, "report" | "attemptHistories">
>;

function comparisonReadingIndex(
	cases: readonly CaseComparisonReading[],
): ComparisonReadingIndex {
	return {
		armFigures: Object.fromEntries(
			cases.map((reading) => [reading.caseId, reading.armFigures]),
		),
		attempts: Object.fromEntries(
			cases.map((reading) => [reading.caseId, reading.attempts]),
		),
		attribution: Object.fromEntries(
			cases.map((reading) => [reading.caseId, reading.attribution]),
		),
		qualityReadings: Object.fromEntries(
			cases.map((reading) => [reading.caseId, reading.qualityReadings]),
		),
		sessionAssessments: Object.fromEntries(
			cases.flatMap((reading) =>
				reading.sessionAssessment === undefined
					? []
					: [[reading.caseId, reading.sessionAssessment]],
			),
		),
		summary: Object.fromEntries(
			cases.map((reading) => [reading.caseId, reading.summary]),
		),
		whatMoved: Object.fromEntries(
			cases.map((reading) => [reading.caseId, reading.whatMoved]),
		),
	};
}

export { comparisonReadingIndex as default };
