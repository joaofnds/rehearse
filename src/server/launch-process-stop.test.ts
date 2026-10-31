import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { readLaunchRecord, writeLaunchRecord } from "#benchmark/launch-record";
import {
	RUN as ANALYZED_RUN,
	runStoppedAtBuild,
} from "#benchmark/root-cause-analysis-test-support";
import type Harness from "#server/launch-http-test-driver";
import {
	LaunchFixture,
	launchedSchema,
	refusalSchema,
} from "#server/launch-http-test-fixture";

import { FAKE_LAUNCH_PID } from "./launch-test-support";

const launchFixture = new LaunchFixture();

const { harness } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

async function launched(post: Harness["post"]): Promise<string> {
	const response = await post({
		attempts: 1,
		caseId: "pipe-case",
		kind: "case",
	});

	return launchedSchema.parse(await response.json()).id;
}

describe("POST /api/launches/:id/stop", () => {
	it(
		"signals the launch's process to stop and answers accepted",
		verifySignalsTheLaunchSProcessToStopAndAnswers,
	);
	it(
		"records that the operator asked it to stop",
		verifyRecordsThatTheOperatorAskedItToStop,
	);
	it(
		"stops a launch a server started before it restarted",
		verifyStopsALaunchAServerStartedBeforeItRestarted,
	);
	describe("when it is a root-cause analysis", () => {
		it(
			"refuses, leaving the one capped call to end and record what it spent",
			verifyRefusesLeavingTheOneCappedCallToEndAnd,
		);
	});
	it(
		"refuses a launch that was never recorded",
		verifyRefusesALaunchThatWasNeverRecorded,
	);
	it(
		"refuses a launch whose process has ended",
		verifyRefusesALaunchWhoseProcessHasEnded,
	);
	it(
		"refuses a launch whose pid a later process now holds",
		verifyRefusesALaunchWhosePidALaterProcessNow,
	);
	it(
		"refuses a launch recorded without its start time",
		verifyRefusesALaunchRecordedWithoutItsStartTime,
	);
});

async function verifySignalsTheLaunchSProcessToStopAndAnswers(): Promise<void> {
	const server = await harness();
	const id = await launched(server.post);

	const response = await server.stop(id);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
	expect(server.launcher.stopped).toEqual([FAKE_LAUNCH_PID]);
}

async function verifyRecordsThatTheOperatorAskedItToStop(): Promise<void> {
	const server = await harness();
	const id = await launched(server.post);

	await server.stop(id);

	const record = await readLaunchRecord(server.runsDirectory, id);
	expect(record.stopRequestedAt).toBeString();
}

async function verifyStopsALaunchAServerStartedBeforeItRestarted(): Promise<void> {
	const server = await harness();
	const id = await launched(server.post);
	const restarted = await server.restarted();

	const response = await restarted.stop(id);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
	expect(restarted.launcher.stopped).toEqual([FAKE_LAUNCH_PID]);
}

async function verifyRefusesLeavingTheOneCappedCallToEndAnd(): Promise<void> {
	const server = await harness();
	await runStoppedAtBuild(server.runsDirectory);
	const response = await server.post({
		kind: "analysis",
		run: ANALYZED_RUN,
		statedUsd: 1,
	});
	const { id } = launchedSchema.parse(await response.json());

	const stop = await server.stop(id);

	expect(stop.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await stop.json()).error).toBe(
		`Launch ${id} is a root-cause analysis, one call capped at the cost it stated; stopping it from the browser is not offered`,
	);
	expect(server.launcher.stopped).toEqual([]);
	const record = await readLaunchRecord(server.runsDirectory, id);
	expect(record.stopRequestedAt).toBeUndefined();
}

async function verifyRefusesALaunchThatWasNeverRecorded(): Promise<void> {
	const server = await harness();

	const response = await server.stop(crypto.randomUUID());

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	expect(server.launcher.stopped).toEqual([]);
}

async function verifyRefusesALaunchWhoseProcessHasEnded(): Promise<void> {
	const server = await harness();
	const id = await launched(server.post);
	server.launcher.processes.delete(FAKE_LAUNCH_PID);

	const response = await server.stop(id);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(server.launcher.stopped).toEqual([]);
}

async function verifyRefusesALaunchWhosePidALaterProcessNow(): Promise<void> {
	const server = await harness();
	const id = await launched(server.post);
	server.launcher.processes.set(FAKE_LAUNCH_PID, "Wed Sep 30 09:00:00 2026");

	const response = await server.stop(id);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(server.launcher.stopped).toEqual([]);
}

async function verifyRefusesALaunchRecordedWithoutItsStartTime(): Promise<void> {
	const server = await harness();
	const id = await launched(server.post);
	const { startedAt: _startedAt, ...withoutStart } = await readLaunchRecord(
		server.runsDirectory,
		id,
	);
	await writeLaunchRecord(server.runsDirectory, withoutStart);

	const response = await server.stop(id);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(server.launcher.stopped).toEqual([]);
}
