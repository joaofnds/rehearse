import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import { pauseRequested } from "#benchmark/run-pause";
import {
	RUNNING_RUN,
	RecordedRunsFixture,
	claimBy,
} from "#benchmark/run-records-test-support";
import { LaunchFixture, runningRun } from "#server/launch-http-test-fixture";

const launchFixture = new LaunchFixture();

const { harness } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

const RUN_PID = 4242;

const running: RunLiveness = {
	isAlive: (pid) => pid === RUN_PID,
	readMarker: async () => await Promise.resolve(claimBy(RUNNING_RUN, RUN_PID)),
};

describe("POST /api/runs/:run/pause", () => {
	it(
		"asks a RUNNING run to pause after its stage and answers accepted",
		verifyAsksARUNNINGRunToPauseAfterItsStage,
	);
	it(
		"refuses a run that is no longer running and asks nothing",
		verifyRefusesARunThatIsNoLongerRunningAnd,
	);
	it(
		"refuses a run whose record cannot be read as not running",
		verifyRefusesARunWhoseRecordCannotBeReadAs,
	);
	it(
		"answers a failure to read a run's manifest as a server error, not a refusal",
		verifyAnswersAFailureToReadARunSManifest,
	);
	it("refuses a run it has no record of", verifyRefusesARunItHasNoRecordOf);
});

async function verifyAsksARUNNINGRunToPauseAfterItsStage(): Promise<void> {
	const server = await harness("stored", running);
	const run = await runningRun(server.runsDirectory);

	const response = await server.pause(run);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
	expect(
		await pauseRequested(benchmarkRunPaths(server.runsDirectory, run)),
	).toBe(true);
}

async function verifyRefusesARunThatIsNoLongerRunningAnd(): Promise<void> {
	const server = await harness();
	const run = await runningRun(server.runsDirectory);

	const response = await server.pause(run);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(
		await pauseRequested(benchmarkRunPaths(server.runsDirectory, run)),
	).toBe(false);
}

async function verifyRefusesARunWhoseRecordCannotBeReadAs(): Promise<void> {
	const server = await harness("stored", running);
	const fixture = new RecordedRunsFixture(server.runsDirectory);
	await fixture.events.writeCompletedRunWithoutArtifact();

	const response = await server.pause(fixture.unrecordedArtifactRun);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
}

async function verifyAnswersAFailureToReadARunSManifest(): Promise<void> {
	const server = await harness("stored", running);
	const run = await runningRun(server.runsDirectory);
	await Bun.write(
		benchmarkRunPaths(server.runsDirectory, run).manifestFile,
		"{",
	);

	const response = await server.pause(run);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_INTERNAL_SERVER_ERROR);
}

async function verifyRefusesARunItHasNoRecordOf(): Promise<void> {
	const server = await harness("stored", running);

	const response = await server.pause("2026-01-01T00-00-00.000Z");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
}
