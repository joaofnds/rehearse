import { describe, expect, it } from "bun:test";

import { parseComparisonReport } from "./comparison-record";
import buildComparisonReport from "./comparison-report";
import type { JudgedOutcomeExample } from "./comparison-report-integrity-test-examples";
import {
	OUTSIDE_DOMAIN_EXAMPLES,
	UNSUCCESSFUL_JUDGE_EXAMPLES,
} from "./comparison-report-integrity-test-examples";
import { comparisonEvidenceFixture } from "./comparison-report-test-fixtures";
import {
	changeFirstBaseline,
	changeFirstOutcome,
	changeFirstRep,
	markFirstOutcomeSuccessful,
} from "./comparison-report-validation-test-fixtures";

describe(buildComparisonReport.name, () => {
	it(
		"rejects outcomes whose order disagrees with report measures",
		rejectsOutcomesWhoseOrderDisagreesWithReportMeasures,
	);

	it(
		"rejects an outcome name that disagrees with report measures",
		rejectsAnOutcomeNameThatDisagreesWithReportMeasures,
	);

	it.each([...OUTSIDE_DOMAIN_EXAMPLES])(
		"rejects a grade outside the $domain domain",
		rejectsGradeOutsideDomain,
	);

	it.each([...UNSUCCESSFUL_JUDGE_EXAMPLES])(
		"rejects a successful judged $domain failure",
		rejectsSuccessfulJudgedFailure,
	);
});

function rejectsOutcomesWhoseOrderDisagreesWithReportMeasures(): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});
	const candidate = changeFirstBaseline(report, (arm) =>
		changeFirstRep(arm, (rep) => {
			const [firstOutcome, secondOutcome, ...remainingOutcomes] = rep.outcomes;
			if (firstOutcome === undefined || secondOutcome === undefined) {
				throw new Error("comparison rep has fewer than two outcomes");
			}

			return {
				...rep,
				outcomes: [secondOutcome, firstOutcome, ...remainingOutcomes],
			};
		}),
	);

	expect(() => parseComparisonReport(JSON.stringify(candidate))).toThrow();
}

function rejectsAnOutcomeNameThatDisagreesWithReportMeasures(): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});
	const candidate = changeFirstBaseline(report, (arm) =>
		changeFirstOutcome(arm, (outcome) => ({
			...outcome,
			name: "wrong-measure",
		})),
	);

	expect(() => parseComparisonReport(JSON.stringify(candidate))).toThrow();
}

function rejectsGradeOutsideDomain({
	name,
	grade,
	gradeDistribution,
}: JudgedOutcomeExample): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});
	const candidate = changeFirstBaseline(report, (arm) =>
		markFirstOutcomeSuccessful(arm, {
			grade,
			gradeDistribution,
			name,
		}),
	);

	expect(() => parseComparisonReport(JSON.stringify(candidate))).toThrow();
}

function rejectsSuccessfulJudgedFailure({
	name,
	grade,
	gradeDistribution,
}: JudgedOutcomeExample): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});
	const candidate = changeFirstBaseline(report, (arm) =>
		markFirstOutcomeSuccessful(arm, {
			grade,
			gradeDistribution,
			name,
		}),
	);

	expect(() => parseComparisonReport(JSON.stringify(candidate))).toThrow();
}
