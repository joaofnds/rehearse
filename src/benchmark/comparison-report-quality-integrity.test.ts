import { describe, expect, it } from "bun:test";

import { parseComparisonReport } from "./comparison-record";
import buildComparisonReport from "./comparison-report";
import {
	COUNT_MISMATCH_INCREMENT,
	RATE_MISMATCH_INCREMENT,
	REPORTED_COUNT_FIELDS,
	REPORTED_ESTIMATE_FIELDS,
} from "./comparison-report-integrity-test-examples";
import { comparisonEvidenceFixture } from "./comparison-report-test-fixtures";
import {
	changeFirstBaseline,
	changeFirstSummary,
} from "./comparison-report-validation-test-fixtures";

describe(buildComparisonReport.name, () => {
	it(
		"rejects a quality name that disagrees with report measures",
		rejectsAQualityNameThatDisagreesWithReportMeasures,
	);

	it.each([...REPORTED_COUNT_FIELDS])(
		"rejects a changed %s count",
		rejectsChangedCount,
	);

	it.each([...REPORTED_ESTIMATE_FIELDS])(
		"rejects a changed %s estimate",
		rejectsChangedEstimate,
	);

	it("rejects a changed grade distribution", rejectsAChangedGradeDistribution);
});

function rejectsAQualityNameThatDisagreesWithReportMeasures(): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});
	const candidate = changeFirstBaseline(report, (arm) =>
		changeFirstSummary(arm, (summary) => ({
			...summary,
			name: "wrong-measure",
		})),
	);

	expect(() => parseComparisonReport(JSON.stringify(candidate))).toThrow();
}

function rejectsAChangedGradeDistribution(): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});
	const candidate = changeFirstBaseline(report, (arm) =>
		changeFirstSummary(arm, (summary) => ({
			...summary,
			gradeDistribution: Object.fromEntries(
				[{ count: 999, grade: "A" }].map(({ grade, count }) => [grade, count]),
			),
		})),
	);

	expect(() => parseComparisonReport(JSON.stringify(candidate))).toThrow();
}

function rejectsChangedCount(
	field: (typeof REPORTED_COUNT_FIELDS)[number],
): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});
	const candidate = changeFirstBaseline(report, (arm) =>
		changeFirstSummary(arm, (summary) => ({
			...summary,
			[field]: summary[field] + COUNT_MISMATCH_INCREMENT,
		})),
	);

	expect(() => parseComparisonReport(JSON.stringify(candidate))).toThrow();
}

function rejectsChangedEstimate(
	field: (typeof REPORTED_ESTIMATE_FIELDS)[number],
): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});
	const candidate = changeFirstBaseline(report, (arm) =>
		changeFirstSummary(arm, (summary) => ({
			...summary,
			[field]: summary[field] + RATE_MISMATCH_INCREMENT,
		})),
	);

	expect(() => parseComparisonReport(JSON.stringify(candidate))).toThrow();
}
