import type { ComparisonEvidence } from "./comparison-evidence";
import type { SourceRep } from "./comparison-report-integrity-test-examples";
import { INITIAL_BASELINE_REP_INDEX } from "./comparison-report-integrity-test-examples";
import { comparisonEvidenceFixture } from "./comparison-report-test-fixtures";
import type { RepFixtureOutcomes } from "./comparison-test-fixtures";
import {
	FAIL,
	PASS,
	comparisonReps,
	withMissingMetrics,
} from "./comparison-test-fixtures";

const INCOMPLETE_BASELINE_OUTCOMES: readonly RepFixtureOutcomes[] = [
	PASS,
	{
		build: "not-reached",
		discussion: "error",
		final: "not-reached",
	},
	{
		build: "metrics-missing",
		discussion: "pass",
		final: "not-reached",
	},
	PASS,
];

const OMITTED_INITIAL_CASE_COUNT = 1;

const FINAL_BASELINE_REP_INDEX = 3;

const FOURTH_BASELINE_REP_INDEX = 3;

const EXPECTED_BASELINE_REPETITION_OUTCOMES = [
	{
		ordinal: 1,
		outcome: {
			grade: "A",
			name: "discuss",
			status: "JUDGED",
			successful: true,
		},
	},
	{
		ordinal: 2,
		outcome: {
			grade: "A",
			name: "discuss",
			status: "JUDGED",
			successful: true,
		},
	},
	{
		ordinal: 3,
		outcome: {
			grade: "D",
			name: "discuss",
			status: "JUDGED",
			successful: false,
		},
	},
	{
		ordinal: 4,
		outcome: {
			grade: "D",
			name: "discuss",
			status: "JUDGED",
			successful: false,
		},
	},
] satisfies readonly {
	readonly ordinal: number;
	readonly outcome: SourceRep["outcomes"][number];
}[];

const EXPECTED_CANDIDATE_REPETITION_OUTCOMES = [
	{
		ordinal: 1,
		outcome: {
			grade: "D",
			name: "discuss",
			status: "JUDGED",
			successful: false,
		},
	},
	{
		ordinal: 2,
		outcome: {
			grade: "D",
			name: "discuss",
			status: "JUDGED",
			successful: false,
		},
	},
	{
		ordinal: 3,
		outcome: {
			grade: "A",
			name: "discuss",
			status: "JUDGED",
			successful: true,
		},
	},
	{
		ordinal: 4,
		outcome: {
			grade: "A",
			name: "discuss",
			status: "JUDGED",
			successful: true,
		},
	},
] satisfies readonly {
	readonly ordinal: number;
	readonly outcome: SourceRep["outcomes"][number];
}[];

const EXPECTED_EXECUTION_GAP_OUTCOMES = [
	{
		name: "discuss",
		status: "EXECUTION_FAILED",
		successful: false,
	},
	{ name: "build", status: "NOT_REACHED", successful: false },
	{ name: "final", status: "NOT_REACHED", successful: false },
] satisfies SourceRep["outcomes"];

const EXPECTED_MATCHED_GRADE_DISTRIBUTION = Object.fromEntries(
	[
		{ count: 2, grade: "A" },
		{ count: 2, grade: "D" },
	].map(({ grade, count }) => [grade, count]),
);

function matchedDistributionEvidenceFixture(): ComparisonEvidence {
	const fixture = comparisonEvidenceFixture();

	const candidateRecords = comparisonReps("case-1", "candidate", {
		outcomes: [FAIL, FAIL, PASS, PASS],
	});

	const [firstCase] = fixture.cases;

	if (firstCase === undefined) {
		throw new Error("fixture has no first case");
	}

	return {
		...fixture,
		cases: [
			{
				...firstCase,
				arms: {
					...firstCase.arms,
					candidate: {
						...firstCase.arms.candidate,
						reps: Array.from(firstCase.arms.candidate.reps, (rep, index) => ({
							...rep,
							record: candidateRecords[index] ?? rep.record,
						})),
					},
				},
			},
			...fixture.cases.slice(OMITTED_INITIAL_CASE_COUNT),
		],
	};
}

function incompleteOutcomeEvidenceFixture(): ComparisonEvidence {
	const fixture = comparisonEvidenceFixture();

	const [firstCase] = fixture.cases;

	if (firstCase === undefined) {
		throw new Error("fixture has no first case");
	}

	const baseline = comparisonReps("case-1", "baseline", {
		outcomes: INCOMPLETE_BASELINE_OUTCOMES,
	});

	const lastRep = baseline.at(FOURTH_BASELINE_REP_INDEX);

	if (lastRep === undefined) {
		throw new Error("fixture has no fourth baseline rep");
	}

	return {
		...fixture,
		cases: [
			{
				...firstCase,
				arms: {
					...firstCase.arms,
					baseline: {
						...firstCase.arms.baseline,
						reps: Array.from(firstCase.arms.baseline.reps, (rep, index) => ({
							...rep,
							record:
								index === FINAL_BASELINE_REP_INDEX
									? withMissingMetrics(lastRep, "final judge metrics")
									: (baseline[index] ?? rep.record),
						})),
					},
				},
			},
			...fixture.cases.slice(OMITTED_INITIAL_CASE_COUNT),
		],
	};
}

function pipelineFinalEvidenceFixture(
	final: RepFixtureOutcomes["final"],
): ComparisonEvidence {
	const fixture = comparisonEvidenceFixture();

	const [firstCase] = fixture.cases;

	if (firstCase === undefined) {
		throw new Error("fixture has no first case");
	}

	const [replacement] = comparisonReps("case-1", "baseline", {
		outcomes: [{ build: "pass", discussion: "pass", final }],
	});

	if (replacement === undefined) {
		throw new Error("fixture has no replacement rep");
	}

	return {
		...fixture,
		cases: [
			{
				...firstCase,
				arms: {
					...firstCase.arms,
					baseline: {
						...firstCase.arms.baseline,
						reps: Array.from(firstCase.arms.baseline.reps, (rep, index) =>
							index === INITIAL_BASELINE_REP_INDEX
								? { ...rep, record: replacement }
								: rep,
						),
					},
				},
			},
			...fixture.cases.slice(OMITTED_INITIAL_CASE_COUNT),
		],
	};
}

export {
	EXPECTED_BASELINE_REPETITION_OUTCOMES,
	EXPECTED_CANDIDATE_REPETITION_OUTCOMES,
	EXPECTED_EXECUTION_GAP_OUTCOMES,
	EXPECTED_MATCHED_GRADE_DISTRIBUTION,
	incompleteOutcomeEvidenceFixture,
	matchedDistributionEvidenceFixture,
	pipelineFinalEvidenceFixture,
};
