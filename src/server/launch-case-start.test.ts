import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { readLaunchRecord } from "#benchmark/launch-record";
import {
	LaunchFixture,
	launchedSchema,
} from "#server/launch-http-test-fixture";

import { FAKE_LAUNCH_PID, FAKE_LAUNCH_STARTED_AT } from "./launch-test-support";

const launchFixture = new LaunchFixture();

const { harness } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

describe("POST /api/launches", () => {
	it(
		"runs the case under its declared model and answers with the launch id",
		verifyRunsTheCaseUnderItsDeclaredModelAndAnswers,
	);
	it(
		"records the launch, its pid and when that process started in the records directory",
		verifyRecordsTheLaunchItsPidAndWhenThatProcess,
	);
	it(
		"dates the launch before its process starts, so its run claims the target after that date",
		verifyDatesTheLaunchBeforeItsProcessStartsSoIts,
	);
	it.each(
		([{ attempts: 3 }, { attempts: 6 }, { attempts: 12 }] as const).map(
			({ attempts }) => [attempts] as const,
		),
	)(
		"asks for a confirmation group of %d already approved",
		async (attempts) => {
			const { launcher, post } = await harness();

			await post({ attempts, caseId: "pipe-case", kind: "case" });

			expect(launcher.launches.map(({ argv }) => argv)).toEqual([
				[
					"run",
					"--case",
					"pipe-case",
					"--model",
					"sonnet",
					"--effort",
					"medium",
					"--confirm",
					"--reps",
					String(attempts),
					"--yes",
					"--approved-in-browser",
				],
			]);
		},
	);
});

async function verifyRunsTheCaseUnderItsDeclaredModelAndAnswers(): Promise<void> {
	const { launcher, post } = await harness();

	const response = await post({
		attempts: 1,
		caseId: "sess-case",
		kind: "case",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
	expect(launchedSchema.parse(await response.json()).id).toBeString();
	expect(launcher.launches.map(({ argv }) => argv)).toEqual([
		["run", "--case", "sess-case", "--model", "haiku", "--effort", "low"],
	]);
}

async function verifyRecordsTheLaunchItsPidAndWhenThatProcess(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();

	const response = await post({
		attempts: 1,
		caseId: "pipe-case",
		kind: "case",
	});
	const { id } = launchedSchema.parse(await response.json());
	const record = await readLaunchRecord(runsDirectory, id);

	const [observedFirstLaunch] = launcher.launches;

	expect(record).toMatchObject({
		attempts: 1,
		caseId: "pipe-case",
		id,
		kind: "case",
		pid: FAKE_LAUNCH_PID,
		startedAt: FAKE_LAUNCH_STARTED_AT,
	});
	expect(observedFirstLaunch?.logFile).toBe(
		join(runsDirectory, "launches", `${id}.log`),
	);
}

async function verifyDatesTheLaunchBeforeItsProcessStartsSoIts(): Promise<void> {
	const driver = await harness();
	const held = driver.launcher.holdNextLaunch();

	const pending = driver.post({
		attempts: 1,
		caseId: "pipe-case",
		kind: "case",
	});
	await held.reached;
	const whileStarting = new Date("2026-10-01T00:00:01.000Z");
	driver.advanceTimeTo(whileStarting);
	held.release();
	const response = await pending;
	const record = await readLaunchRecord(
		driver.runsDirectory,
		launchedSchema.parse(await response.json()).id,
	);
	expect(Date.parse(record.launchedAt)).toBeLessThan(whileStarting.getTime());
}
