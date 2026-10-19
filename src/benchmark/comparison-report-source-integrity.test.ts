import { describe, expect, it } from "bun:test";

import { parseComparisonReport } from "./comparison-record";
import buildComparisonReport from "./comparison-report";
import {
	FIRST_SOURCE_REP_INDEX,
	OMITTED_FINAL_REP_OFFSET,
	PREFIX_START_INDEX,
	REQUESTED_REP_COUNT,
	SUCCESSFUL_REP_COUNT,
	TOTAL_PROBABILITY,
} from "./comparison-report-integrity-test-examples";
import { comparisonEvidenceFixture } from "./comparison-report-test-fixtures";
import {
	changeFirstBaseline,
	changeFirstRep,
	changeSecondRep,
} from "./comparison-report-validation-test-fixtures";

describe(buildComparisonReport.name, () => {
	it(
		"rejects a source rep count that disagrees with report reps",
		rejectsASourceRepCountThatDisagreesWithReportReps,
	);

	it("rejects a source rep with no ordinal", rejectsASourceRepWithNoOrdinal);

	it(
		"rejects duplicate source rep ordinals",
		rejectsDuplicateSourceRepOrdinals,
	);

	it("rejects a source rep with no ID", rejectsASourceRepWithNoID);

	it("rejects duplicate source rep IDs", rejectsDuplicateSourceRepIDs);
});

function rejectsASourceRepCountThatDisagreesWithReportReps(): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});
	const successRate = SUCCESSFUL_REP_COUNT / REQUESTED_REP_COUNT;
	const candidate = changeFirstBaseline(report, (arm) => ({
		...arm,
		quality: Array.from(arm.quality, (summary) => ({
			...summary,
			attempted: 3,
			failed: 1,
			gradeDistribution:
				summary.name === "final"
					? { FAIL: 1, PASS: 2 }
					: Object.fromEntries(
							[
								{ count: 2, grade: "A" },
								{ count: 1, grade: "D" },
							].map(({ grade, count }) => [grade, count]),
						),
			notReached: 0,
			passK: successRate ** REQUESTED_REP_COUNT,
			requested: 3,
			standardError: Math.sqrt(
				(successRate * (TOTAL_PROBABILITY - successRate)) / REQUESTED_REP_COUNT,
			),
			successRate,
			successful: 2,
		})),
		source: {
			...arm.source,
			reps: arm.source.reps.slice(PREFIX_START_INDEX, OMITTED_FINAL_REP_OFFSET),
		},
	}));

	expect(() => parseComparisonReport(JSON.stringify(candidate))).toThrow();
}

function rejectsASourceRepWithNoOrdinal(): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});
	const candidate = changeFirstBaseline(report, (arm) =>
		changeFirstRep(arm, (rep) => {
			const { ordinal: _ordinal, ...withoutOrdinal } = rep;

			return withoutOrdinal;
		}),
	);

	expect(() => parseComparisonReport(JSON.stringify(candidate))).toThrow();
}

function rejectsDuplicateSourceRepOrdinals(): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});
	const candidate = changeFirstBaseline(report, (arm) =>
		changeSecondRep(arm, (rep) => ({ ...rep, ordinal: 1 })),
	);

	expect(() => parseComparisonReport(JSON.stringify(candidate))).toThrow();
}

function rejectsASourceRepWithNoID(): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});
	const candidate = changeFirstBaseline(report, (arm) =>
		changeFirstRep(arm, (rep) => {
			const { repId: _repId, ...withoutRepId } = rep;

			return withoutRepId;
		}),
	);

	expect(() => parseComparisonReport(JSON.stringify(candidate))).toThrow();
}

function rejectsDuplicateSourceRepIDs(): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});
	const candidate = changeFirstBaseline(report, (arm) =>
		changeSecondRep(arm, (rep) => ({
			...rep,
			repId: arm.source.reps[FIRST_SOURCE_REP_INDEX]?.repId,
		})),
	);

	expect(() => parseComparisonReport(JSON.stringify(candidate))).toThrow();
}
