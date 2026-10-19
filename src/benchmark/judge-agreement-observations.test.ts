import { describe, expect, it } from "bun:test";

import { calibrationObservations } from "./judge-agreement";
import {
	CONFLICTING_FINDINGS,
	EXPECTED_CALIBRATION_OBSERVATIONS,
	FIRST_CALIBRATION_OBSERVATION_INDEX,
	FULL_CALIBRATION,
	dimensionCalibration,
	finalEvidence,
} from "./judge-agreement-calibration-test-fixtures";

function labelsEveryOriginalStageAndFinalRubricDecision(): void {
	const observations = calibrationObservations(FULL_CALIBRATION);

	expect(observations).toEqual(EXPECTED_CALIBRATION_OBSERVATIONS);
}

function keepsRealDefectsWhenACriterionAlsoHasAFalsePositive(): void {
	const findings = CONFLICTING_FINDINGS;

	const humanDecisions = [findings, findings.toReversed()].map(
		(orderedFindings) =>
			calibrationObservations({
				final: {
					grade: {
						requirements: [
							{ evidence: finalEvidence, id: "criterion", status: "FAIL" },
						],
						summary: "failed criterion",
						verdict: "FAIL",
					},
					rubric: "1. `criterion`: contract\n",
				},
				humanReview: {
					findings: orderedFindings,
					summary: "reviewed both findings",
					verdict: "REJECT",
				},
				judgeModel: "opus",
				stages: [],
			})[FIRST_CALIBRATION_OBSERVATION_INDEX]?.humanDecision,
	);

	expect(humanDecisions).toEqual(["FAIL", "FAIL"]);
}

describe(calibrationObservations.name, () => {
	it(
		"labels every original stage and final rubric decision",
		labelsEveryOriginalStageAndFinalRubricDecision,
	);

	it(
		"keeps real defects when a criterion also has a false positive",
		keepsRealDefectsWhenACriterionAlsoHasAFalsePositive,
	);

	it.each([
		{ decision: "PASS", grade: "A" as const },
		{ decision: "PASS", grade: "B" as const },
		{ decision: "FAIL", grade: "C" as const },
		{ decision: "FAIL", grade: "D" as const },
		{ decision: "FAIL", grade: "F" as const },
	])("maps dimension grade $grade to $decision", ({ grade, decision }) => {
		const [observation] = calibrationObservations(dimensionCalibration(grade));

		expect(observation).toMatchObject({
			humanDecision: decision,
			judgeDecision: decision,
		});
	});
});
