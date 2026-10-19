import type { ComparisonProjectionInput } from "./comparison-evidence";
import ComparisonProjectionBuilder from "./comparison-projection-test-builder";
import { FAIL, PASS, comparisonReps } from "./comparison-test-fixtures";

const EXPECTED_SUCCESS_RATE = 0.5;
const REQUESTED_REP_COUNT = 4;
function firstMixedQualityCase(): ComparisonProjectionInput["cases"][number] {
	return {
		arms: {
			baseline: comparisonReps("case-1", "baseline", {
				outcomes: [
					PASS,
					PASS,
					FAIL,
					{
						build: "not-reached",
						discussion: "error",
						final: "not-reached",
					},
				],
			}),
			candidate: comparisonReps("case-1", "candidate", {
				outcomes: [PASS, PASS, PASS, PASS],
			}),
			control: comparisonReps("case-1", "control", {
				outcomes: [FAIL, FAIL, FAIL, FAIL],
			}),
		},
		caseId: "case-1",
	};
}

function secondMixedQualityCase(): ComparisonProjectionInput["cases"][number] {
	return {
		arms: {
			baseline: comparisonReps("case-2", "baseline", {
				outcomes: [PASS, FAIL, FAIL, FAIL],
			}),
			candidate: comparisonReps("case-2", "candidate", {
				outcomes: [PASS, PASS, PASS, PASS],
			}),
			control: comparisonReps("case-2", "control", {
				outcomes: [FAIL, FAIL, FAIL, FAIL],
			}),
		},
		caseId: "case-2",
	};
}
const QualityProjections = {
	complete(): ComparisonProjectionInput {
		return new ComparisonProjectionBuilder({
			cases: [firstMixedQualityCase(), secondMixedQualityCase()],
			contract: {
				declaredStages: ["discuss", "build"],
				mode: "pipeline",
				reps: 4,
			},
		}).build();
	},
};
const EXPECTED_BASELINE_QUALITY = [
	{
		attempted: 4,
		failed: 2,
		gradeDistribution: Object.fromEntries(
			[
				{ count: 2, grade: "A" },
				{ count: 1, grade: "D" },
			].map(({ grade, count }) => [grade, count]),
		),
		name: "discuss",
		notReached: 0,
		passK: EXPECTED_SUCCESS_RATE ** REQUESTED_REP_COUNT,
		requested: 4,
		standardError: 0.25,
		successRate: 0.5,
		successful: 2,
	},
	{
		attempted: 3,
		failed: 1,
		gradeDistribution: Object.fromEntries(
			[
				{ count: 2, grade: "A" },
				{ count: 1, grade: "D" },
			].map(({ grade, count }) => [grade, count]),
		),
		name: "build",
		notReached: 1,
		passK: EXPECTED_SUCCESS_RATE ** REQUESTED_REP_COUNT,
		requested: 4,
		standardError: 0.25,
		successRate: 0.5,
		successful: 2,
	},
	{
		attempted: 3,
		failed: 1,
		gradeDistribution: { FAIL: 1, PASS: 2 },
		name: "final",
		notReached: 1,
		passK: EXPECTED_SUCCESS_RATE ** REQUESTED_REP_COUNT,
		requested: 4,
		standardError: 0.25,
		successRate: 0.5,
		successful: 2,
	},
];
export { QualityProjections, EXPECTED_BASELINE_QUALITY };
