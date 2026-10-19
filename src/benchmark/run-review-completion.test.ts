import { describe, expect, it } from "bun:test";

import {
	finishGradedRun,
	pauseForFailureInspection,
	pausesOnFailure,
} from "./run-review-completion";
import {
	CalibratedFinishFixture,
	fakeFinish,
	finishRequest,
} from "./run-review-test-fixtures";

async function retainsCandidateWithoutPause(): Promise<void> {
	const { order, dependencies } = fakeFinish();

	await finishGradedRun(finishRequest, dependencies);

	expect(order).toEqual([
		"await-review",
		`retain:${finishRequest.runName}:${finishRequest.resultSha}`,
	]);
}

async function calibratesAndCompletesWithPause(): Promise<void> {
	const { order, calibration, judgeAgreement, completed, dependencies } =
		new CalibratedFinishFixture();

	await finishGradedRun({ ...finishRequest, pause: true }, dependencies);

	const [observedFirstCompleted] = completed;
	expect(order).toEqual(["calibrate", "agreement", "complete"]);
	expect(observedFirstCompleted?.status).toBe("COMPLETE");
	expect(observedFirstCompleted?.calibration).toBe(calibration);
	expect(observedFirstCompleted?.judgeAgreement).toBe(judgeAgreement);
}

async function asksBeforeTargetRestoration(): Promise<void> {
	const asked: string[] = [];
	const reported: string[] = [];

	await pauseForFailureInspection(
		{
			question: async (prompt) => {
				asked.push(prompt);

				return await Promise.resolve("");
			},
		},
		"/tmp/target",
		(message) => {
			reported.push(message);
		},
	);

	expect(asked).toEqual([
		"The run failed. Inspect /tmp/target if useful, then press Enter to remove the run's checkout.",
	]);
	expect(reported).toEqual([]);
}

async function keepsRunFailureAfterStdinCloses(): Promise<void> {
	const reported: string[] = [];

	const settled = pauseForFailureInspection(
		{
			question: async () =>
				await Promise.reject(
					new Error("readline was closed [ERR_USE_AFTER_CLOSE]"),
				),
		},
		"/tmp/target",
		(message) => {
			reported.push(message);
		},
	);

	expect(settled).resolves.toBeUndefined();
	await settled;
	expect(reported).toEqual([
		"No interactive stdin; removing the run's checkout now.",
	]);
}

describe(pausesOnFailure.name, () => {
	it.each([
		{ pause: false, stageFailureCalibrated: false, stops: false },
		{ pause: false, stageFailureCalibrated: true, stops: false },
		{ pause: true, stageFailureCalibrated: false, stops: true },
		{ pause: true, stageFailureCalibrated: true, stops: false },
	])(
		"stops for the reviewer: $stops when pause is $pause and the stage was calibrated $stageFailureCalibrated",
		({ pause, stageFailureCalibrated, stops }) => {
			expect(pausesOnFailure(pause, stageFailureCalibrated)).toBe(stops);
		},
	);
});

describe(pauseForFailureInspection.name, () => {
	it(
		"asks the reviewer to inspect the target before it is restored",
		asksBeforeTargetRestoration,
	);
	it(
		"restores without the prompt when stdin has closed, keeping the run's own failure",
		keepsRunFailureAfterStdinCloses,
	);
});

describe(finishGradedRun.name, () => {
	it(
		"pins the candidate under refs/rehearse and asks nothing without a pause",
		retainsCandidateWithoutPause,
	);
	it(
		"calibrates and completes the artifact with a pause",
		calibratesAndCompletesWithPause,
	);
});
