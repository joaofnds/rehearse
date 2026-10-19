import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { readLaunchRecord } from "#benchmark/launch-record";
import {
	LaunchFixture,
	launchedSchema,
	replayableRun,
} from "#server/launch-http-test-fixture";

const launchFixture = new LaunchFixture();

const { harness } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

describe("POST /api/launches", () => {
	it(
		"replays the stage under the run's recorded model",
		verifyReplaysTheStageUnderTheRunSRecordedModel,
	);
	it.each(
		([{ attempts: 3 }, { attempts: 6 }, { attempts: 12 }] as const).map(
			({ attempts }) => [attempts] as const,
		),
	)("asks for a replay group of %d already approved", async (attempts) => {
		const { launcher, post, runsDirectory } = await harness();
		const run = await replayableRun(runsDirectory);

		await post({ attempts, kind: "replay", run, stage: "build" });

		expect(launcher.launches.map(({ argv }) => argv)).toEqual([
			[
				"replay",
				"--run",
				run,
				"--stage",
				"build",
				"--model",
				"sonnet",
				"--confirm",
				"--reps",
				String(attempts),
				"--yes",
				"--approved-in-browser",
			],
		]);
	});
	it(
		"records the run and stage the launch replays",
		verifyRecordsTheRunAndStageTheLaunchReplays,
	);
});

async function verifyReplaysTheStageUnderTheRunSRecordedModel(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	const run = await replayableRun(runsDirectory);

	const response = await post({
		attempts: 1,
		kind: "replay",
		run,
		stage: "build",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
	expect(launcher.launches.map(({ argv }) => argv)).toEqual([
		["replay", "--run", run, "--stage", "build", "--model", "sonnet"],
	]);
}

async function verifyRecordsTheRunAndStageTheLaunchReplays(): Promise<void> {
	const { post, runsDirectory } = await harness();
	const run = await replayableRun(runsDirectory);

	const response = await post({
		attempts: 3,
		kind: "replay",
		run,
		stage: "discuss",
	});
	const { id } = launchedSchema.parse(await response.json());

	expect(await readLaunchRecord(runsDirectory, id)).toMatchObject({
		attempts: 3,
		kind: "replay",
		run,
		stage: "discuss",
	});
}
