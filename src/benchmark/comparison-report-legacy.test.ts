import { describe, expect, it } from "bun:test";

import {
	VERSION_ONE_COMPARISON_SCHEMA,
	armResourcesWithoutElapsed,
	versionTwoReport,
} from "./comparison-legacy-report-test-fixtures";
import type { LegacyComparisonReport } from "./comparison-record";
import { parseComparisonReport } from "./comparison-record";
import buildComparisonReport from "./comparison-report";
import { OMITTED_INITIAL_CASE_COUNT } from "./comparison-report-integrity-test-examples";
import { comparisonEvidenceFixture } from "./comparison-report-test-fixtures";

describe(buildComparisonReport.name, () => {
	it(
		"refuses a current report whose arm resources omit the elapsed measurement",
		refusesACurrentReportWhoseArmResourcesOmitTheElapsedMeasurement,
	);

	it(
		"parses persisted version-one and version-two reports strictly",
		parsesPersistedVersionOneAndVersionTwoReportsStrictly,
	);
});

function refusesACurrentReportWhoseArmResourcesOmitTheElapsedMeasurement(): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});
	const [firstCase] = report.cases;
	if (firstCase === undefined) {
		throw new Error("comparison report has no first case");
	}

	const withoutElapsed = {
		...report,
		cases: [
			{
				...firstCase,
				arms: {
					...firstCase.arms,
					baseline: {
						...firstCase.arms.baseline,
						resources: armResourcesWithoutElapsed(
							firstCase.arms.baseline.resources,
						),
					},
				},
			},
			...report.cases.slice(OMITTED_INITIAL_CASE_COUNT),
		],
	};

	expect(() => parseComparisonReport(JSON.stringify(withoutElapsed))).toThrow();
}

function parsesPersistedVersionOneAndVersionTwoReportsStrictly(): void {
	const current = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});
	if (current.mode !== "pipeline") {
		throw new Error("expected a stage or pipeline comparison report");
	}
	const versionTwo = versionTwoReport(current);

	expect(parseComparisonReport(JSON.stringify(versionTwo))).toEqual(versionTwo);

	const { judgeAgreement: _judgeAgreement, ...reportWithoutAgreement } =
		versionTwo;
	const legacy = {
		...reportWithoutAgreement,
		schemaVersion: VERSION_ONE_COMPARISON_SCHEMA,
	} satisfies LegacyComparisonReport;

	expect(parseComparisonReport(JSON.stringify(legacy))).toEqual(legacy);
	expect(() =>
		parseComparisonReport(
			JSON.stringify({ ...legacy, unexpected: "not strict" }),
		),
	).toThrow();
}
