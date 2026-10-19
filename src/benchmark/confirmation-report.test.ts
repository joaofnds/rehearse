import { describe, expect, it } from "bun:test";

import ConfirmationReliabilityRepBuilder from "./confirmation-reliability-test-builder";
import { buildReliabilityReport } from "./confirmation-report";

const EXPECTED_DISCUSSION_SUCCESS_RATE = 0.4;
const REQUESTED_CONFIRMATION_REP_COUNT = 5;
const EXPECTED_DISCUSSION_FAILURE_RATE = 0.6;
const EXPECTED_BUILD_AND_FINAL_SUCCESS_RATE = 0.2;
const EXPECTED_BUILD_AND_FINAL_FAILURE_RATE = 0.8;

const expectedStageReliability = [
	{
		attempted: 5,
		failed: 3,
		gradeDistribution: Object.fromEntries(
			[
				{ count: 1, grade: "A" },
				{ count: 1, grade: "B" },
				{ count: 1, grade: "D" },
			].map(({ grade, count }) => [grade, count]),
		),
		name: "shape",
		notReached: 0,
		passK: EXPECTED_DISCUSSION_SUCCESS_RATE ** REQUESTED_CONFIRMATION_REP_COUNT,
		requested: 5,
		standardError: Math.sqrt(
			(EXPECTED_DISCUSSION_SUCCESS_RATE * EXPECTED_DISCUSSION_FAILURE_RATE) /
				REQUESTED_CONFIRMATION_REP_COUNT,
		),
		successRate: 0.4,
		successful: 2,
	},
	{
		attempted: 2,
		failed: 1,
		gradeDistribution: Object.fromEntries(
			[
				{ count: 1, grade: "B" },
				{ count: 1, grade: "C" },
			].map(({ grade, count }) => [grade, count]),
		),
		name: "build",
		notReached: 3,
		passK:
			EXPECTED_BUILD_AND_FINAL_SUCCESS_RATE ** REQUESTED_CONFIRMATION_REP_COUNT,
		requested: 5,
		standardError: Math.sqrt(
			(EXPECTED_BUILD_AND_FINAL_SUCCESS_RATE *
				EXPECTED_BUILD_AND_FINAL_FAILURE_RATE) /
				REQUESTED_CONFIRMATION_REP_COUNT,
		),
		successRate: 0.2,
		successful: 1,
	},
	{
		attempted: 2,
		failed: 1,
		gradeDistribution: { FAIL: 1, PASS: 1 },
		name: "final",
		notReached: 3,
		passK:
			EXPECTED_BUILD_AND_FINAL_SUCCESS_RATE ** REQUESTED_CONFIRMATION_REP_COUNT,
		requested: 5,
		standardError: Math.sqrt(
			(EXPECTED_BUILD_AND_FINAL_SUCCESS_RATE *
				EXPECTED_BUILD_AND_FINAL_FAILURE_RATE) /
				REQUESTED_CONFIRMATION_REP_COUNT,
		),
		successRate: 0.2,
		successful: 1,
	},
];
const buildReliabilityReportReportsReliabilityForEveryStageAndTheFinalOutcome =
	(): void => {
		const report = buildReliabilityReport(
			["shape", "build"],
			[
				new ConfirmationReliabilityRepBuilder().build(),
				new ConfirmationReliabilityRepBuilder().judgedFailureRep().build(),
				new ConfirmationReliabilityRepBuilder().stoppedPlanningRep().build(),
				new ConfirmationReliabilityRepBuilder().failedPlanningRep().build(),
				new ConfirmationReliabilityRepBuilder().unmeasuredPlanningRep().build(),
			],
		);

		expect(report).toEqual(expectedStageReliability);
	};

const buildReliabilityReportRetainsGradesWithoutCountingPassingOutcomesWithMissingMetrics =
	(): void => {
		const expectedCountedPlanningSuccesses = 0;
		const expectedCountedBuildSuccesses = 0;

		const report = buildReliabilityReport(
			["build"],
			[
				{
					finalOutcome: { status: "JUDGED", verdict: "PASS" },
					metricsComplete: false,
					stages: [
						{
							grade: "A",
							stage: "build",
							status: "JUDGED",
							verdict: "CONTINUE",
						},
					],
				},
			],
		);

		expect(report.map(({ successful }) => successful)).toEqual([
			expectedCountedPlanningSuccesses,
			expectedCountedBuildSuccesses,
		]);
		expect(report.map(({ gradeDistribution }) => gradeDistribution)).toEqual([
			Object.fromEntries(
				[{ count: 1, grade: "A" }].map(({ grade, count }) => [grade, count]),
			),
			{ PASS: 1 },
		]);
	};
describe(buildReliabilityReport.name, () => {
	it(
		"reports reliability for every stage and the final outcome",
		buildReliabilityReportReportsReliabilityForEveryStageAndTheFinalOutcome,
	);

	it(
		"retains grades without counting passing outcomes with missing metrics",
		buildReliabilityReportRetainsGradesWithoutCountingPassingOutcomesWithMissingMetrics,
	);
});
