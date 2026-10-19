import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import type { RunLiveness } from "#benchmark/run-liveness";
import { RUNNING_RUN, claimBy } from "#benchmark/run-records-test-support";
import { LaunchFixture, runningRun } from "#server/launch-http-test-fixture";

const launchFixture = new LaunchFixture();

const { harness } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

const RUN_PID = 4343;

const CLAIMED_AT = "2026-09-30T00:00:00.000Z";

const running: RunLiveness = {
	isAlive: (pid) => pid === RUN_PID,
	readMarker: async () =>
		await Promise.resolve(claimBy(RUNNING_RUN, RUN_PID, CLAIMED_AT)),
};

describe("POST /api/runs/:run/stop", () => {
	describe("when a run started outside the browser is stopped", () => {
		it(
			"signals the process that claimed its target and answers accepted",
			verifySignalsTheProcessThatClaimedItsTargetAndAnswers,
		);
		it(
			"refuses a pid whose process started after the claim, which is not the run's",
			verifyRefusesAPidWhoseProcessStartedAfterTheClaim,
		);
		it(
			"refuses a run whose target holds no live claim of its own",
			verifyRefusesARunWhoseTargetHoldsNoLiveClaim,
		);
		it("refuses a run it has no record of", verifyRefusesARunItHasNoRecordOf);
	});
});

async function verifySignalsTheProcessThatClaimedItsTargetAndAnswers(): Promise<void> {
	const server = await harness("stored", running);
	server.launcher.processes.set(RUN_PID, "Tue Sep 29 23:59:59 2026");
	const run = await runningRun(server.runsDirectory);

	const response = await server.stopRun(run);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
	expect(server.launcher.stopped).toEqual([RUN_PID]);
}

async function verifyRefusesAPidWhoseProcessStartedAfterTheClaim(): Promise<void> {
	const server = await harness("stored", running);
	server.launcher.processes.set(RUN_PID, "Wed Sep 30 00:00:05 2026");
	const run = await runningRun(server.runsDirectory);

	const response = await server.stopRun(run);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(server.launcher.stopped).toEqual([]);
}

async function verifyRefusesARunWhoseTargetHoldsNoLiveClaim(): Promise<void> {
	const server = await harness();
	server.launcher.processes.set(RUN_PID, "Tue Sep 29 23:59:59 2026");
	const run = await runningRun(server.runsDirectory);

	const response = await server.stopRun(run);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(server.launcher.stopped).toEqual([]);
}

async function verifyRefusesARunItHasNoRecordOf(): Promise<void> {
	const server = await harness("stored", running);

	const response = await server.stopRun("2026-01-01T00-00-00.000Z");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
}
