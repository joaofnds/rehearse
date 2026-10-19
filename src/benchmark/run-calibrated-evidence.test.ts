import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import { z } from "zod";

import type { CalibrationResult } from "./contracts";
import { runGradedStages } from "./run";
import {
	StageContextBuilder,
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import { stoppedStageDependencies } from "./run-stage-dependencies-test-fixture";
import { readStageRecord } from "./run-stage-evidence-test-fixtures";
import { deliveryStage } from "./run-stage-judge-test-fixtures";
import { TEST_TARGET } from "./test-support";

const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});

const corpusFilesSchema = z.array(
	z.object({ path: z.string(), sha256: z.string() }),
);

const inputSchema = z.object({ commitSubjects: z.array(z.string()) });

const calibrationSchema = z.object({
	humanReview: z.object({ verdict: z.literal("REJECT") }),
});
const calibratedSessionRecordSchema = z.object({
	calibration: calibrationSchema,
	corpusFiles: corpusFilesSchema,
	effort: z.string(),
	model: z.string(),
});

const calibratedDeliveryRecordSchema = z.object({
	calibration: calibrationSchema,
	input: inputSchema,
});
const retainsCalibratedSessionInputs = async (): Promise<void> => {
	const { dependencies } = stoppedStageDependencies();
	const context = {
		...(await new StageContextBuilder().build()),
		calibrateStageFailure: async (): Promise<CalibrationResult> =>
			await Promise.resolve<CalibrationResult>({
				humanReview: { findings: [], summary: "failed", verdict: "REJECT" },
				instructionsChanged: false,
				rubricChanged: false,
				stageRubricsChanged: [],
			}),
		effort: "high" as const,
		model: "opus",
	};

	const outcome = runGradedStages(dependencies, context);

	expect(outcome).rejects.toThrow("minimum grade is B");
	await Promise.allSettled([outcome]);

	const stageRecord = await readStageRecord(
		context,
		"shape",
		calibratedSessionRecordSchema,
	);
	expect(stageRecord).toEqual({
		calibration: { humanReview: { verdict: "REJECT" } },
		corpusFiles: [
			{
				path: "skills/shape/SKILL.md",
				sha256: createHash("sha256").update("shape").digest("hex"),
			},
		],
		effort: "high",
		model: "opus",
	});
};

const retainsCalibratedCommitSubjects = async (): Promise<void> => {
	const { dependencies } = stoppedStageDependencies();
	const context = {
		...(await new StageContextBuilder().build()),
		calibrateStageFailure: async (): Promise<CalibrationResult> =>
			await Promise.resolve<CalibrationResult>({
				humanReview: { findings: [], summary: "failed", verdict: "REJECT" },
				instructionsChanged: false,
				rubricChanged: false,
				stageRubricsChanged: [],
			}),
		pipeline: {
			stages: [deliveryStage],
			statuses: ["To Do", "Done"],
			target: TEST_TARGET,
		},
	};

	const outcome = runGradedStages(dependencies, context);

	expect(outcome).rejects.toThrow("minimum grade is B");
	await Promise.allSettled([outcome]);

	const calibrated = await readStageRecord(
		context,
		"build",
		calibratedDeliveryRecordSchema,
	);
	expect(calibrated.input.commitSubjects).toEqual(["build commit"]);
	expect(calibrated.calibration.humanReview.verdict).toBe("REJECT");
};
describe("runGradedStages calibrated evidence", () => {
	it(
		"preserves the stage session inputs when adding a stopped scorecard's calibration",
		retainsCalibratedSessionInputs,
	);

	it(
		"retains commit subjects when calibrating a stopped delivery",
		retainsCalibratedCommitSubjects,
	);
});
