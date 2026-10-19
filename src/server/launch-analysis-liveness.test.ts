import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { writeLaunchRecord } from "#benchmark/launch-record";
import {
	RUN as ANALYZED_RUN,
	runStoppedAtBuild,
} from "#benchmark/root-cause-analysis-test-support";
import { launchIds, launchPaths } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import {
	LaunchFixture,
	NOTHING_RUNNING,
	refusalSchema,
} from "#server/launch-http-test-fixture";

import { FAKE_LAUNCH_STARTED_AT } from "./launch-test-support";

const launchFixture = new LaunchFixture();

const { harness } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

const ANALYSIS_PID = 5151;

const analysisAlive: RunLiveness = {
	isAlive: (pid) => pid === ANALYSIS_PID,
	readMarker: async () => {
		await Promise.try((): undefined => undefined);
	},
};

async function analysisLaunched(
	runsDirectory: string,
	run: string,
): Promise<void> {
	await writeLaunchRecord(runsDirectory, {
		id: crypto.randomUUID(),
		kind: "analysis",
		launchedAt: new Date().toISOString(),
		pid: ANALYSIS_PID,
		run,
		startedAt: FAKE_LAUNCH_STARTED_AT,
		usd: 1,
	});
}

describe("POST /api/launches", () => {
	it(
		"refuses a second analysis of a run while its process is alive, before starting or recording anything",
		verifyRefusesASecondAnalysisOfARunWhileIts,
	);
	it(
		"starts an analysis of a run while another run's analysis is alive",
		verifyStartsAnAnalysisOfARunWhileAnotherRun,
	);
	it(
		"starts an analysis of a run while a replay of it is alive",
		verifyStartsAnAnalysisOfARunWhileAReplay,
	);
	it(
		"starts another analysis of a run once the earlier one's process has exited",
		verifyStartsAnotherAnalysisOfARunOnceTheEarlier,
	);
	describe("when a launch record does not read", () => {
		it("starts an analysis beside it", verifyStartsAnAnalysisBesideIt);
	});
});

async function verifyRefusesASecondAnalysisOfARunWhileIts(): Promise<void> {
	const expectedLaunchIdCount = 1;

	const { launcher, post, runsDirectory } = await harness(
		"stored",
		analysisAlive,
	);
	await runStoppedAtBuild(runsDirectory);
	await analysisLaunched(runsDirectory, ANALYZED_RUN);

	const response = await post({
		kind: "analysis",
		run: ANALYZED_RUN,
		statedUsd: 1,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toBe(
		`An analysis of run ${ANALYZED_RUN} is already in flight; read its result when it ends`,
	);
	expect(await launchIds(runsDirectory)).toHaveLength(expectedLaunchIdCount);
	expect(launcher.launches).toEqual([]);
}

async function verifyStartsAnAnalysisOfARunWhileAnotherRun(): Promise<void> {
	const { post, runsDirectory } = await harness("stored", analysisAlive);
	await runStoppedAtBuild(runsDirectory);
	await analysisLaunched(runsDirectory, "another-run");

	const response = await post({
		kind: "analysis",
		run: ANALYZED_RUN,
		statedUsd: 1,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
}

async function verifyStartsAnAnalysisOfARunWhileAReplay(): Promise<void> {
	const { post, runsDirectory } = await harness("stored", analysisAlive);
	await runStoppedAtBuild(runsDirectory);
	await writeLaunchRecord(runsDirectory, {
		attempts: 1,
		id: crypto.randomUUID(),
		kind: "replay",
		launchedAt: new Date().toISOString(),
		pid: ANALYSIS_PID,
		run: ANALYZED_RUN,
		stage: "build",
	});

	const response = await post({
		kind: "analysis",
		run: ANALYZED_RUN,
		statedUsd: 1,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
}

async function verifyStartsAnotherAnalysisOfARunOnceTheEarlier(): Promise<void> {
	const { post, runsDirectory } = await harness("stored", NOTHING_RUNNING);
	await runStoppedAtBuild(runsDirectory);
	await analysisLaunched(runsDirectory, ANALYZED_RUN);

	const response = await post({
		kind: "analysis",
		run: ANALYZED_RUN,
		statedUsd: 1,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
}

async function verifyStartsAnAnalysisBesideIt(): Promise<void> {
	const { post, runsDirectory } = await harness();
	await runStoppedAtBuild(runsDirectory);
	await Bun.write(
		launchPaths(runsDirectory, crypto.randomUUID()).recordFile,
		"not json",
	);

	const response = await post({
		kind: "analysis",
		run: ANALYZED_RUN,
		statedUsd: 1,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
}
