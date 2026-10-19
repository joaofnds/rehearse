import { afterEach, describe, expect, it } from "bun:test";
import { chmod, mkdir } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { dirname } from "node:path";

import {
	RUN as ANALYZED_RUN,
	runStoppedAtBuild,
} from "#benchmark/root-cause-analysis-test-support";
import { launchPaths } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import {
	EXECUTABLE_PERMISSIONS,
	READ_ONLY_DIRECTORY_PERMISSIONS,
} from "#server/file-permissions-test-support";
import { LaunchFixture, refusalSchema } from "#server/launch-http-test-fixture";

import { FAKE_LAUNCH_PID } from "./launch-test-support";

const launchFixture = new LaunchFixture();

const { harness } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

const launchedAlive: RunLiveness = {
	isAlive: (pid) => pid === FAKE_LAUNCH_PID,
	readMarker: async () => {
		await Promise.try((): undefined => undefined);
	},
};

const expectedLaunchCount = 1;

const ANALYSIS_REQUEST = { kind: "analysis", run: ANALYZED_RUN, statedUsd: 1 };

describe("POST /api/launches", () => {
	describe("when another analysis of the run is still starting", () => {
		it(
			"refuses the later request, so one process starts",
			verifyRefusesTheLaterRequestSoOneProcessStarts,
		);
	});
	describe("when an analysis's launch cannot be recorded", () => {
		it(
			"stops its process, so no analysis runs that nothing can see",
			verifyStopsItsProcessSoNoAnalysisRunsThatNothing,
		);
	});
	it(
		"starts the next one after the earlier was refused",
		verifyStartsTheNextOneAfterTheEarlierWasRefused,
	);
	it(
		"starts the next one after the earlier's process failed to start",
		verifyStartsTheNextOneAfterTheEarlierSProcess,
	);
});

async function verifyRefusesTheLaterRequestSoOneProcessStarts(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	await runStoppedAtBuild(runsDirectory);
	const held = launcher.holdNextLaunch();

	const pending = post(ANALYSIS_REQUEST);
	await held.reached;
	const second = await post(ANALYSIS_REQUEST);
	held.release();
	const first = await pending;

	expect({
		error: refusalSchema.parse(await second.json()).error,
		first: first.status,
		second: second.status,
	}).toEqual({
		error: `An analysis of run ${ANALYZED_RUN} is already starting; try again in a moment`,
		first: HTTP_STATUS.HTTP_STATUS_ACCEPTED,
		second: HTTP_STATUS.HTTP_STATUS_CONFLICT,
	});
	expect(launcher.launches).toHaveLength(expectedLaunchCount);
}

async function verifyStopsItsProcessSoNoAnalysisRunsThatNothing(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	await runStoppedAtBuild(runsDirectory);
	const launches = dirname(launchPaths(runsDirectory, "any").recordFile);
	await mkdir(launches, { recursive: true });
	await chmod(launches, READ_ONLY_DIRECTORY_PERMISSIONS);

	const response = await post({
		kind: "analysis",
		run: ANALYZED_RUN,
		statedUsd: 1,
	});
	await chmod(launches, EXECUTABLE_PERMISSIONS);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_INTERNAL_SERVER_ERROR);
	expect(launcher.stopped).toEqual([FAKE_LAUNCH_PID]);
}

async function verifyStartsTheNextOneAfterTheEarlierWasRefused(): Promise<void> {
	const { post, runsDirectory } = await harness("stored", launchedAlive);
	await runStoppedAtBuild(runsDirectory);
	await post({ kind: "analysis", run: ANALYZED_RUN, statedUsd: 0.5 });

	const response = await post({
		kind: "analysis",
		run: ANALYZED_RUN,
		statedUsd: 1,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
}

async function verifyStartsTheNextOneAfterTheEarlierSProcess(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness(
		"stored",
		launchedAlive,
	);
	await runStoppedAtBuild(runsDirectory);
	launcher.failNextLaunch("spawn failed");
	await post({ kind: "analysis", run: ANALYZED_RUN, statedUsd: 1 });

	const response = await post({
		kind: "analysis",
		run: ANALYZED_RUN,
		statedUsd: 1,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
}
