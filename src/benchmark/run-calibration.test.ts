import { afterEach, describe, expect, it } from "bun:test";

import { z } from "zod";

import { failureOf } from "#cli/cli-test-support";

import { runGradedStages } from "./run";
import {
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import { stoppedStageFixture } from "./run-stage-dependencies-test-fixture";
import { readStageRecord } from "./run-stage-evidence-test-fixtures";
import StageCalibrationFake from "./run-stage-review-test-fixtures";

const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});

const expectedCalibrations = 1;

const calibrationSchema = z.looseObject({
	humanReview: z.looseObject({ verdict: z.string() }),
});

const expectedCurrentCalibrationCount = 1;

const expectedStageCount = 1;

const judgeAgreementSchema = z.object({
	baselines: z.array(z.unknown()),
	skippedCalibrations: z.number(),
});

const calibrationRecordSchema = z.looseObject({
	calibration: calibrationSchema,
});

const agreementRecordSchema = z.object({
	judgeAgreement: judgeAgreementSchema,
	judgeModel: z.literal("opus"),
});

const uncalibratedRecordSchema = z.record(z.string(), z.json());

const calibratesFailedStage = async (): Promise<void> => {
	const review = new StageCalibrationFake();
	const { dependencies, executed, context } = await stoppedStageFixture({
		calibrateStageFailure: review.calibrateStageFailure,
	});

	const outcome = runGradedStages(dependencies, context);

	expect(outcome).rejects.toThrow("minimum grade is B");
	expect(executed).toEqual(["shape"]);
	expect(review.asked).toHaveLength(expectedCalibrations);
	const stageRecord = await readStageRecord(
		context,
		"shape",
		calibrationRecordSchema,
	);
	expect(stageRecord.calibration.humanReview.verdict).toBe("REJECT");
};

const collectsStoppedAgreement = async (): Promise<void> => {
	const review = new StageCalibrationFake();
	const { dependencies, context } = await stoppedStageFixture({
		calibrateStageFailure: review.calibrateStageFailure,
		collectJudgeAgreement: review.collectJudgeAgreement,
		judgeModel: "opus",
	});

	const outcome = runGradedStages(dependencies, context);

	expect(outcome).rejects.toThrow("minimum grade is B");
	await Promise.allSettled([outcome]);
	const [observedFirstCurrentCalibration] = review.currentCalibrations;
	expect(review.currentCalibrations).toHaveLength(
		expectedCurrentCalibrationCount,
	);
	expect(observedFirstCurrentCalibration).toMatchObject({
		humanReview: review.review?.humanReview,
		judgeModel: "opus",
	});
	expect(observedFirstCurrentCalibration?.stages).toHaveLength(
		expectedStageCount,
	);
};

const recordsUncalibratedStage = async (): Promise<void> => {
	const review = new StageCalibrationFake({ review: undefined });
	const { dependencies, context } = await stoppedStageFixture({
		calibrateStageFailure: review.calibrateStageFailure,
		collectJudgeAgreement: review.collectJudgeAgreement,
	});

	const outcome = runGradedStages(dependencies, context);

	expect(outcome).rejects.toThrow("minimum grade is B");
	await Promise.allSettled([outcome]);
	expect(review.asked).toEqual(["calibrate"]);
	const stageRecord = await readStageRecord(
		context,
		"shape",
		uncalibratedRecordSchema,
	);
	expect(stageRecord).toMatchObject({ stage: "shape" });
	expect(stageRecord).not.toHaveProperty("calibration");
	expect(stageRecord).not.toHaveProperty("judgeAgreement");
};
const persistsStoppedAgreement = async (): Promise<void> => {
	const review = new StageCalibrationFake();
	const { dependencies, context } = await stoppedStageFixture({
		calibrateStageFailure: review.calibrateStageFailure,
		collectJudgeAgreement: review.collectJudgeAgreement,
		judgeModel: "opus",
	});

	await failureOf(runGradedStages(dependencies, context));
	const stageRecord = await readStageRecord(
		context,
		"shape",
		agreementRecordSchema,
	);

	expect(stageRecord.judgeAgreement).toEqual({
		baselines: [],
		skippedCalibrations: 0,
	});
};
describe("runGradedStages calibration", () => {
	it(
		"stops after a failing grade and calibrates the failed stage",
		calibratesFailedStage,
	);

	it(
		"records the stopped stage's Judge agreement including its calibration",
		collectsStoppedAgreement,
	);

	it(
		"writes an uncalibrated stopped stage when no pause collects a review",
		recordsUncalibratedStage,
	);
	it(
		"persists the stopped stage agreement report with its judge model",
		persistsStoppedAgreement,
	);
});
