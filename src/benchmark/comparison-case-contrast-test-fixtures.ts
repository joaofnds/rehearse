import type { ComparisonEvidence } from "./comparison-evidence";
import { SHA256_HEX_CHARACTERS } from "./comparison-evidence-record-test-fixtures";
import type { ComparisonArm } from "./comparison-record";
import { reportArmEvidence } from "./comparison-report-test-fixtures";
import type { ComparisonRepResults } from "./comparison-test-fixtures";
import { FAIL, PASS, comparisonReps } from "./comparison-test-fixtures";

interface ConfiguredCase {
	readonly caseId: string;
	readonly arms: Readonly<Record<ComparisonArm, ComparisonRepResults>>;
}

const FLAT_CASES: readonly ConfiguredCase[] = [
	{
		arms: {
			baseline: { outcomes: [PASS, PASS, FAIL, FAIL] },
			candidate: { outcomes: [PASS, PASS, PASS, PASS] },
			control: { outcomes: [PASS, PASS, PASS, PASS] },
		},
		caseId: "case-1",
	},
	{
		arms: {
			baseline: { outcomes: [PASS, PASS, FAIL, FAIL] },
			candidate: { outcomes: [PASS, PASS, FAIL, FAIL] },
			control: { outcomes: [PASS, PASS, FAIL, FAIL] },
		},
		caseId: "case-2",
	},
];

const CANCELLING_CASES: readonly ConfiguredCase[] = [
	{
		arms: {
			baseline: {
				measurements: { metricScale: 1 },
				outcomes: [PASS, PASS, FAIL, FAIL],
			},
			candidate: {
				measurements: { metricScale: 3 },
				outcomes: [PASS, PASS, PASS, PASS],
			},
			control: {
				measurements: { metricScale: 2 },
				outcomes: [FAIL, FAIL, FAIL, FAIL],
			},
		},
		caseId: "case-1",
	},
	{
		arms: {
			baseline: {
				measurements: { metricScale: 1 },
				outcomes: [PASS, PASS, PASS, PASS],
			},
			candidate: {
				measurements: { metricScale: 2 },
				outcomes: [PASS, PASS, FAIL, FAIL],
			},
			control: {
				measurements: { metricScale: 4 },
				outcomes: [FAIL, FAIL, FAIL, FAIL],
			},
		},
		caseId: "case-2",
	},
];

function configuredCaseEvidence({
	caseId,
	arms,
}: ConfiguredCase): ComparisonEvidence["cases"][number] {
	return {
		arms: {
			baseline: reportArmEvidence(
				caseId,
				"baseline",
				comparisonReps(caseId, "baseline", arms.baseline),
			),
			candidate: reportArmEvidence(
				caseId,
				"candidate",
				comparisonReps(caseId, "candidate", arms.candidate),
			),
			control: reportArmEvidence(
				caseId,
				"control",
				comparisonReps(caseId, "control", arms.control),
			),
		},
		caseId,
	};
}

/**
 * Two cases where the candidate wins one and ties the other exactly. The tie
 * contributes a delta of exactly zero, the boundary the disagreement test turns
 * on: zero counts as agreement, so this reads blank rather than as a
 * disagreement, and relaxing the negative side of the test to `<=` reports it
 * as one.
 */
function flatCaseComparisonEvidenceFixture(): ComparisonEvidence {
	const cases = FLAT_CASES.map((configured) =>
		configuredCaseEvidence(configured),
	);
	return {
		cases,
		contract: {
			declaredStages: ["discuss", "build"],
			mode: "pipeline",
			reps: 4,
		},
		manifest: {
			path: "/tmp/comparison.json",
			sha256: "8".repeat(SHA256_HEX_CHARACTERS),
		},
		sourcePaths: [],
	};
}

/**
 * Two cases whose candidate-minus-baseline deltas cancel: the candidate wins
 * case-1 and loses case-2 by the same margin, so the mean is exactly zero while
 * neither case is null. A report built from this is the shape a mean alone
 * cannot describe.
 */
function cancellingComparisonEvidenceFixture(): ComparisonEvidence {
	const cases = CANCELLING_CASES.map((configured) =>
		configuredCaseEvidence(configured),
	);
	return {
		cases,
		contract: {
			declaredStages: ["discuss", "build"],
			mode: "pipeline",
			reps: 4,
		},
		manifest: {
			path: "/tmp/comparison.json",
			sha256: "8".repeat(SHA256_HEX_CHARACTERS),
		},
		sourcePaths: [],
	};
}

export {
	cancellingComparisonEvidenceFixture,
	flatCaseComparisonEvidenceFixture,
};
