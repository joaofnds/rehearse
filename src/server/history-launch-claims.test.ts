import { afterEach, describe, expect, it } from "bun:test";

import { writeLaunchRecord } from "#benchmark/launch-record";
import { claimBy, directorySource } from "#benchmark/run-records-test-support";
import {
	CLAIMED_AT,
	LAUNCH_ID,
	LIVE_PID,
	launchLiveness,
	launched,
} from "#server/history-launch-test-fixture";
import { pipelineRun } from "#server/history-record-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import type { PipelineRunRow } from "./run-history";
import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

describe("history launch claims", () => {
	it(
		"lists a launched pipeline run once, as its own row, when that run is RUNNING",
		verifyListsALaunchedPipelineRunOnceAsItsOwn,
	);

	it(
		"gives the RUNNING run the id of the launch holding its target",
		verifyGivesTheRUNNINGRunTheIdOfTheLaunch,
	);

	it(
		"keeps a launch listed while an unrelated pipeline run is RUNNING under another pid",
		verifyKeepsALaunchListedWhileAnUnrelatedPipelineRun,
	);

	it(
		"lists a crashed run as INTERRUPTED while a later run holds its target",
		verifyListsACrashedRunAsINTERRUPTEDWhileALater,
	);

	it(
		"gives the RUNNING run no launch id when that launch started after the claim",
		verifyGivesTheRUNNINGRunNoLaunchIdWhenThat,
	);

	it(
		"gives the RUNNING run no launch id when the launch holding its pid is not a case launch",
		verifyGivesTheRUNNINGRunNoLaunchIdWhenThe,
	);
});

async function verifyListsALaunchedPipelineRunOnceAsItsOwn(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun();
	await launched({ fixture, pid: LIVE_PID });

	const { launches, rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(LIVE_PID),
	);

	expect(launches).toEqual([]);
	expect(pipelineRun(rows, fixture.runningRun)?.status).toBe("RUNNING");
}

async function verifyGivesTheRUNNINGRunTheIdOfTheLaunch(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun();
	await launched({ fixture, pid: LIVE_PID });

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(LIVE_PID),
	);

	expect(pipelineRun(rows, fixture.runningRun)?.launchId).toBe(LAUNCH_ID);
}

async function verifyKeepsALaunchListedWhileAnUnrelatedPipelineRun(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun();
	await launched({ fixture, pid: LIVE_PID });
	const otherRunPid = 5151;

	const { launches, rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		{
			isAlive: (pid) => pid === LIVE_PID || pid === otherRunPid,
			readMarker: async () =>
				await Promise.resolve(claimBy(fixture.runningRun, otherRunPid)),
		},
	);

	expect(launches.map(({ id }) => id)).toEqual([LAUNCH_ID]);
	expect(pipelineRun(rows, fixture.runningRun)?.status).toBe("RUNNING");
}

async function verifyListsACrashedRunAsINTERRUPTEDWhileALater(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun();
	await fixture.events.writeLaterRunningRun();
	await launched({ fixture, pid: LIVE_PID });

	const { launches, rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		{
			isAlive: (pid) => pid === LIVE_PID,
			readMarker: async () =>
				await Promise.resolve(
					claimBy(fixture.laterRunningRun, LIVE_PID, CLAIMED_AT),
				),
		},
	);

	expect(pipelineRun(rows, fixture.runningRun)?.status).toBe("INTERRUPTED");
	expect(launches).toEqual([]);
	expect(
		rows
			.filter(
				(row): row is PipelineRunRow =>
					row.kind === "run" && row.status === "RUNNING",
			)
			.map(({ run, launchId }) => ({ launchId, run })),
	).toEqual([{ launchId: LAUNCH_ID, run: fixture.laterRunningRun }]);
}

async function verifyGivesTheRUNNINGRunNoLaunchIdWhenThat(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun();
	await launched({ fixture, pid: LIVE_PID });

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		{
			isAlive: (pid) => pid === LIVE_PID,
			readMarker: async () =>
				await Promise.resolve(
					claimBy(fixture.runningRun, LIVE_PID, "2026-09-29T09:00:00.000Z"),
				),
		},
	);

	expect(pipelineRun(rows, fixture.runningRun)).toMatchObject({
		launchId: undefined,
		status: "RUNNING",
	});
}

async function verifyGivesTheRUNNINGRunNoLaunchIdWhenThe(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun();
	await writeLaunchRecord(fixture.runsDirectory, {
		attempts: 1,
		id: LAUNCH_ID,
		kind: "replay",
		launchedAt: "2026-09-29T10:00:00.000Z",
		pid: LIVE_PID,
		run: fixture.replayableRun,
		stage: "build",
	});

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(LIVE_PID),
	);

	expect(pipelineRun(rows, fixture.runningRun)).toMatchObject({
		launchId: undefined,
		status: "RUNNING",
	});
}
