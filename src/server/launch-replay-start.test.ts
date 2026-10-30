import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { jsonObjectSchema } from "#benchmark/json-value";
import { readLaunchRecord } from "#benchmark/launch-record";
import { benchmarkRunPaths } from "#benchmark/run-layout";
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

/** The shared run fixture predates recorded effort, as older runs on disk do. */
async function recordEffort(
	runsDirectory: string,
	run: string,
	effort: string,
): Promise<void> {
	const { manifestFile } = benchmarkRunPaths(runsDirectory, run);
	const manifest = jsonObjectSchema.parse(await Bun.file(manifestFile).json());

	await Bun.write(manifestFile, JSON.stringify({ ...manifest, effort }));
}

async function verifyLeavesEffortToTheCaseForARunThatRecordedNone(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	const run = await replayableRun(runsDirectory);

	await post({ attempts: 1, kind: "replay", run, stage: "build" });

	expect(launcher.launches.map(({ argv }) => argv)).toEqual([
		["replay", "--run", run, "--stage", "build", "--model", "sonnet"],
	]);
}

describe("POST /api/launches", () => {
	it(
		"leaves effort to the case for a run that recorded none",
		verifyLeavesEffortToTheCaseForARunThatRecordedNone,
	);
	it(
		"replays the stage under the run's recorded model and effort",
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
	await recordEffort(runsDirectory, run, "medium");

	const response = await post({
		attempts: 1,
		kind: "replay",
		run,
		stage: "build",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
	expect(launcher.launches.map(({ argv }) => argv)).toEqual([
		[
			"replay",
			"--run",
			run,
			"--stage",
			"build",
			"--model",
			"sonnet",
			"--effort",
			"medium",
		],
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
