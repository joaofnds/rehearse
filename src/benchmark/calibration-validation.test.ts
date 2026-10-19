import { describe, expect, it } from "bun:test";

import { CalibrationIncompleteError, validateCalibration } from "./calibration";
import {
	FIRST_RUBRIC_ID_INDEX,
	RUBRIC_IDS,
	completeGrade,
	humanReview,
	requirement,
	stageScorecard,
	withFailedFirstRequirement,
} from "./calibration-grade-test-fixtures";
import type { JudgeGrade } from "./contracts";

function throwsACalibrationIncompleteErrorForInconsistentFindings(): void {
	const review = humanReview({
		judgeAssessment: "MISSED",
		rubricId: "worker-metadata",
		verdict: "ACCEPT",
	});

	expect(() => {
		validateCalibration(review, { originalGrade: completeGrade("PASS") });
	}).toThrow(CalibrationIncompleteError);
}

function acceptsAMissedDefectCaughtByTheRevisedRubric(): void {
	const original = completeGrade("PASS");
	const revisedBase = completeGrade("PASS");
	const revised: JudgeGrade = {
		...revisedBase,
		requirements: [
			...revisedBase.requirements,
			requirement("worker-metadata", "FAIL"),
		],
		verdict: "FAIL",
	};
	const review = humanReview({
		judgeAssessment: "MISSED",
		rubricId: "worker-metadata",
		verdict: "REJECT",
	});

	expect(() => {
		validateCalibration(review, {
			originalGrade: original,
			revisedGrade: revised,
		});
	}).not.toThrow();
}

function rejectsAMissedDefectThatTheRevisedRubricStillPasses(): void {
	const original = completeGrade("PASS");
	const revisedBase = completeGrade("PASS");
	const revised: JudgeGrade = {
		...revisedBase,
		requirements: [
			...revisedBase.requirements,
			requirement("worker-metadata", "PASS"),
		],
	};
	const review = humanReview({
		judgeAssessment: "MISSED",
		rubricId: "worker-metadata",
		verdict: "REJECT",
	});

	expect(() => {
		validateCalibration(review, {
			originalGrade: original,
			revisedGrade: revised,
		});
	}).toThrow("does not catch");
}

function rejectsAMissedClassificationForADefectAlreadyCaught(): void {
	const original = withFailedFirstRequirement(
		RUBRIC_IDS[FIRST_RUBRIC_ID_INDEX],
	);
	const revised = completeGrade("FAIL");
	const review = humanReview({
		judgeAssessment: "MISSED",
		rubricId: RUBRIC_IDS[FIRST_RUBRIC_ID_INDEX],
		verdict: "REJECT",
	});

	expect(() => {
		validateCalibration(review, {
			originalGrade: original,
			revisedGrade: revised,
		});
	}).toThrow("already caught");
}

function acceptsACorrectedFalsePositive(): void {
	const original = withFailedFirstRequirement(
		RUBRIC_IDS[FIRST_RUBRIC_ID_INDEX],
	);
	const revised = completeGrade("PASS");
	const review = humanReview({
		judgeAssessment: "FALSE_POSITIVE",
		rubricId: RUBRIC_IDS[FIRST_RUBRIC_ID_INDEX],
		verdict: "ACCEPT",
	});

	expect(() => {
		validateCalibration(review, {
			originalGrade: original,
			revisedGrade: revised,
		});
	}).not.toThrow();
}

function rejectsAcceptanceWhenARealDefectWasFound(): void {
	const review = humanReview({
		judgeAssessment: "CAUGHT",
		rubricId: RUBRIC_IDS[FIRST_RUBRIC_ID_INDEX],
		verdict: "ACCEPT",
	});

	expect(() => {
		validateCalibration(review, { originalGrade: completeGrade("FAIL") });
	}).toThrow("cannot accept");
}

function validatesAMissedStageRequirementAgainstTheRevisedStageRubric(): void {
	const review = humanReview(
		{ judgeAssessment: "MISSED", rubricId: "scope", verdict: "REJECT" },
		"discuss",
	);

	expect(() => {
		validateCalibration(
			review,
			{ originalGrade: undefined, revisedGrade: undefined },
			{
				originalStageScorecards: [stageScorecard("PASS")],
				revisedStageScorecards: [stageScorecard("FAIL")],
			},
		);
	}).not.toThrow();
}

function acceptsAMissedStageDefectAddedAsANewRubricRequirement(): void {
	const review = humanReview(
		{
			judgeAssessment: "MISSED",
			rubricId: "worker-metadata",
			verdict: "REJECT",
		},
		"discuss",
	);

	expect(() => {
		validateCalibration(
			review,
			{ originalGrade: undefined, revisedGrade: undefined },
			{
				originalStageScorecards: [stageScorecard("PASS")],
				revisedStageScorecards: [stageScorecard("FAIL", "worker-metadata")],
			},
		);
	}).not.toThrow();
}
describe(validateCalibration.name, () => {
	it(
		"throws a calibration-incomplete error for inconsistent findings",
		throwsACalibrationIncompleteErrorForInconsistentFindings,
	);
	it(
		"accepts a missed defect caught by the revised rubric",
		acceptsAMissedDefectCaughtByTheRevisedRubric,
	);
	it(
		"rejects a missed defect that the revised rubric still passes",
		rejectsAMissedDefectThatTheRevisedRubricStillPasses,
	);
	it(
		"rejects a missed classification for a defect already caught",
		rejectsAMissedClassificationForADefectAlreadyCaught,
	);
	it("accepts a corrected false positive", acceptsACorrectedFalsePositive);
	it(
		"rejects acceptance when a real defect was found",
		rejectsAcceptanceWhenARealDefectWasFound,
	);
	it(
		"validates a missed stage requirement against the revised stage rubric",
		validatesAMissedStageRequirementAgainstTheRevisedStageRubric,
	);
	it(
		"accepts a missed stage defect added as a new rubric requirement",
		acceptsAMissedStageDefectAddedAsANewRubricRequirement,
	);
});
