import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { writeLaunchRecord } from "#benchmark/launch-record";
import reviewedEdit from "#server/corpus-edit-launch-test-fixture";
import { untouched } from "#server/corpus-edit-snapshot-test-fixture";
import { clearCorpusEditRoots } from "#server/corpus-edit-workspace-test-fixture";

import {
	FAKE_LAUNCH_PID,
	FAKE_LAUNCH_STARTED_AT,
	FAKE_LAUNCH_TIME,
} from "./launch-test-support";

afterEach(clearCorpusEditRoots);

const STORED_CEILING_USD = 5;

async function verifyApiCorpusEditsWhenALaunchThisServerStartedIsLiveRefusesTheApplyWritingNothingAndLoggingNoVersion(): Promise<void> {
	const { served, edit, review } = await reviewedEdit({
		isAlive: (pid) => pid === FAKE_LAUNCH_PID,
		readMarker: async () => {
			await Promise.try((): undefined => undefined);
		},
	});
	await writeLaunchRecord(served.runsDirectory, {
		attempts: 1,
		id: "00000000-0000-4000-8000-000000000001",
		kind: "replay",
		launchedAt: FAKE_LAUNCH_TIME,
		pid: FAKE_LAUNCH_PID,
		run: served.fixture.replayableRun,
		stage: "build",
		startedAt: FAKE_LAUNCH_STARTED_AT,
	});
	const before = await untouched(served);

	const response = await served.driver.applyRaw({
		...edit,
		startsFrom: review.startsFrom,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(await untouched(served)).toEqual(before);
}

async function verifyApiCorpusEditsWhenALaunchThisServerIsStartingHasNotStartedYetRefusesTheApplyWritingNothingAndLoggingNoVersion(): Promise<void> {
	const { served, edit, review } = await reviewedEdit(
		undefined,
		STORED_CEILING_USD,
	);
	const held = served.launcher.holdNextLaunch();
	const launching = served.driver.launch({
		attempts: 1,
		kind: "replay",
		run: served.fixture.replayableRun,
		stage: "build",
	});
	await held.reached;
	const before = await untouched(served);

	const response = await served.driver.applyRaw({
		...edit,
		startsFrom: review.startsFrom,
	});
	held.release();
	const launched = await launching;

	expect({
		applyStatus: response.status,
		launchStatus: launched.status,
		snapshot: await untouched(served),
	}).toEqual({
		applyStatus: HTTP_STATUS.HTTP_STATUS_CONFLICT,
		launchStatus: HTTP_STATUS.HTTP_STATUS_ACCEPTED,
		snapshot: before,
	});
}

describe("/api/corpus/edits", () => {
	describe("when a launch this server started is live", () => {
		it(
			"refuses the apply, writing nothing and logging no version",
			verifyApiCorpusEditsWhenALaunchThisServerStartedIsLiveRefusesTheApplyWritingNothingAndLoggingNoVersion,
		);
	});
});

describe("/api/corpus/edits", () => {
	describe("when a launch this server is starting has not started yet", () => {
		it(
			"refuses the apply, writing nothing and logging no version",
			verifyApiCorpusEditsWhenALaunchThisServerIsStartingHasNotStartedYetRefusesTheApplyWritingNothingAndLoggingNoVersion,
		);
	});
});
