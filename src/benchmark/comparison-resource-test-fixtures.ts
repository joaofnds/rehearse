import type { ComparisonProjectionInput } from "./comparison-evidence";
import ComparisonProjectionBuilder from "./comparison-projection-test-builder";
import type { ComparisonArm } from "./comparison-record";
import {
	FAIL,
	PASS,
	comparisonRep,
	comparisonReps,
	withMissingMetrics,
} from "./comparison-test-fixtures";
import type { ConfirmationRepRecord } from "./confirmation-record";

const FIRST_COMPARISON_REP_ORDINAL = 1;

const SECOND_COMPARISON_REP_ORDINAL = 2;

const THIRD_COMPARISON_REP_ORDINAL = 3;

const FOURTH_COMPARISON_REP_ORDINAL = 4;

const ORDINAL_BASE = 1;

const elapsedArmReps = (
	role: "baseline" | "candidate" | "control",
	elapsedMs: readonly number[],
): readonly ConfirmationRepRecord[] =>
	elapsedMs.map((elapsed, index) =>
		comparisonRep(`case-1-${role}`, index + ORDINAL_BASE, {
			measurements: {
				elapsedMs: elapsed,
			},
			outcomes: PASS,
		}),
	);

const pairedElapsedArmReps = ({
	caseId,
	role,
	elapsedMs,
}: PairedElapsedArmRepsFixtureInput): readonly ConfirmationRepRecord[] =>
	[{ ordinal: 1 }, { ordinal: 2 }].map(({ ordinal }) =>
		comparisonRep(`${caseId}-${role}`, ordinal, {
			measurements: {
				elapsedMs,
				metricScale: 1,
			},
			outcomes: PASS,
		}),
	);

function firstCompleteMetricCase(): ComparisonProjectionInput["cases"][number] {
	return {
		arms: {
			baseline: comparisonReps("case-1", "baseline", {
				measurements: { metricScale: 1 },
				outcomes: [PASS, PASS, PASS, PASS],
			}),
			candidate: comparisonReps("case-1", "candidate", {
				measurements: { metricScale: 2 },
				outcomes: [PASS, PASS, PASS, PASS],
			}),
			control: comparisonReps("case-1", "control", {
				measurements: { metricScale: 0 },
				outcomes: [PASS, PASS, PASS, PASS],
			}),
		},
		caseId: "case-1",
	};
}

function secondCompleteMetricCase(): ComparisonProjectionInput["cases"][number] {
	return {
		arms: {
			baseline: comparisonReps("case-2", "baseline", {
				measurements: { metricScale: 1 },
				outcomes: [PASS, PASS, PASS, PASS],
			}),
			candidate: comparisonReps("case-2", "candidate", {
				measurements: { metricScale: 3 },
				outcomes: [PASS, PASS, PASS, PASS],
			}),
			control: comparisonReps("case-2", "control", {
				measurements: { metricScale: 0 },
				outcomes: [PASS, PASS, PASS, PASS],
			}),
		},
		caseId: "case-2",
	};
}

function missingControlReps(): readonly ConfirmationRepRecord[] {
	return [
		comparisonRep("case-1-control", FIRST_COMPARISON_REP_ORDINAL, {
			measurements: { metricScale: 0 },
			outcomes: FAIL,
		}),
		withMissingMetrics(
			comparisonRep("case-1-control", SECOND_COMPARISON_REP_ORDINAL, {
				measurements: { metricScale: 0 },
				outcomes: FAIL,
			}),
			"stage-judge call metrics",
		),
		comparisonRep("case-1-control", THIRD_COMPARISON_REP_ORDINAL, {
			measurements: { metricScale: 0 },
			outcomes: FAIL,
		}),
		comparisonRep("case-1-control", FOURTH_COMPARISON_REP_ORDINAL, {
			measurements: { metricScale: 0 },
			outcomes: FAIL,
		}),
	];
}

function firstCaseWithMissingMetrics(): ComparisonProjectionInput["cases"][number] {
	const caseOneControl = missingControlReps();
	return {
		arms: {
			baseline: comparisonReps("case-1", "baseline", {
				measurements: { metricScale: 1 },
				outcomes: [PASS, PASS, PASS, PASS],
			}),
			candidate: comparisonReps("case-1", "candidate", {
				measurements: { metricScale: 2 },
				outcomes: [PASS, PASS, PASS, PASS],
			}),
			control: caseOneControl,
		},
		caseId: "case-1",
	};
}

function secondCaseWithFailedControl(): ComparisonProjectionInput["cases"][number] {
	return {
		arms: {
			baseline: comparisonReps("case-2", "baseline", {
				measurements: { metricScale: 1 },
				outcomes: [PASS, PASS, PASS, PASS],
			}),
			candidate: comparisonReps("case-2", "candidate", {
				measurements: { metricScale: 3 },
				outcomes: [PASS, PASS, PASS, PASS],
			}),
			control: comparisonReps("case-2", "control", {
				measurements: { metricScale: 0 },
				outcomes: [FAIL, FAIL, FAIL, FAIL],
			}),
		},
		caseId: "case-2",
	};
}

const recordedShortBaselineDurationMs = 1000;

const recordedLongBaselineDurationMs = 3000;

const recordedShortCandidateDurationMs = 2000;

const recordedLongCandidateDurationMs = 6000;

const recordedShortControlDurationMs = 500;

const recordedLongControlDurationMs = 1500;

interface PairedElapsedArmRepsFixtureInput {
	readonly caseId: string;
	readonly role: ComparisonArm;
	readonly elapsedMs: number;
}

function singleCaseWithDurations(): ComparisonProjectionInput["cases"][number] {
	return {
		arms: {
			baseline: elapsedArmReps("baseline", [
				recordedShortBaselineDurationMs,
				recordedLongBaselineDurationMs,
			]),
			candidate: elapsedArmReps("candidate", [
				recordedShortCandidateDurationMs,
				recordedLongCandidateDurationMs,
			]),
			control: elapsedArmReps("control", [
				recordedShortControlDurationMs,
				recordedLongControlDurationMs,
			]),
		},
		caseId: "case-1",
	};
}

function firstPairedDurationCase(): ComparisonProjectionInput["cases"][number] {
	return {
		arms: {
			baseline: pairedElapsedArmReps({
				caseId: "case-1",
				elapsedMs: 1000,
				role: "baseline",
			}),
			candidate: pairedElapsedArmReps({
				caseId: "case-1",
				elapsedMs: 1500,
				role: "candidate",
			}),
			control: pairedElapsedArmReps({
				caseId: "case-1",
				elapsedMs: 800,
				role: "control",
			}),
		},
		caseId: "case-1",
	};
}

function secondPairedDurationCase(): ComparisonProjectionInput["cases"][number] {
	return {
		arms: {
			baseline: pairedElapsedArmReps({
				caseId: "case-2",
				elapsedMs: 2000,
				role: "baseline",
			}),
			candidate: pairedElapsedArmReps({
				caseId: "case-2",
				elapsedMs: 3000,
				role: "candidate",
			}),
			control: pairedElapsedArmReps({
				caseId: "case-2",
				elapsedMs: 800,
				role: "control",
			}),
		},
		caseId: "case-2",
	};
}

const ResourceProjections = {
	complete(): ComparisonProjectionInput {
		return new ComparisonProjectionBuilder({
			cases: [firstCompleteMetricCase(), secondCompleteMetricCase()],
			contract: {
				declaredStages: ["discuss", "build"],
				mode: "pipeline",
				reps: 4,
			},
		}).build();
	},
	elapsed(): ComparisonProjectionInput {
		return new ComparisonProjectionBuilder({
			cases: [singleCaseWithDurations()],
			contract: {
				declaredStages: ["discuss", "build"],
				mode: "pipeline",
				reps: 2,
			},
		}).build();
	},
	missing(): ComparisonProjectionInput {
		return new ComparisonProjectionBuilder({
			cases: [firstCaseWithMissingMetrics(), secondCaseWithFailedControl()],
			contract: {
				declaredStages: ["discuss", "build"],
				mode: "pipeline",
				reps: 4,
			},
		}).build();
	},
	pairedElapsed(): ComparisonProjectionInput {
		return new ComparisonProjectionBuilder({
			cases: [firstPairedDurationCase(), secondPairedDurationCase()],
			contract: {
				declaredStages: ["discuss", "build"],
				mode: "pipeline",
				reps: 2,
			},
		}).build();
	},
};

export { ResourceProjections as default };
