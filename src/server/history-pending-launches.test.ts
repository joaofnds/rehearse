import { afterEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { writeLaunchRecord } from "#benchmark/launch-record";
import { directorySource } from "#benchmark/run-records-test-support";
import {
	LAUNCH_ID,
	LIVE_PID,
	launchLiveness,
	launched,
} from "#server/history-launch-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

describe("history pending launches", () => {
	it(
		"lists the launch as RUNNING while its process is alive",
		verifyListsTheLaunchAsRUNNINGWhileItsProcessIs,
	);

	it(
		"lists a replay launch under the run and stage it replays",
		verifyListsAReplayLaunchUnderTheRunAndStage,
	);

	it(
		"lists a comparison launch under the checkpoint its arms replayed",
		verifyListsAComparisonLaunchUnderTheCheckpointItsArms,
	);

	it(
		"lists a root-cause analysis launch as one call on the run it reads",
		verifyListsARootCauseAnalysisLaunchAsOneCall,
	);

	it(
		"drops the launch once its process has exited",
		verifyDropsTheLaunchOnceItsProcessHasExited,
	);

	it("lists the newest launch first", verifyListsTheNewestLaunchFirst);

	it(
		"reports a launch record that does not read beside the rows",
		verifyReportsALaunchRecordThatDoesNotReadBeside,
	);

	it(
		"leaves the launch out of a report asked for named records",
		verifyLeavesTheLaunchOutOfAReportAskedFor,
	);
});

async function verifyListsTheLaunchAsRUNNINGWhileItsProcessIs(): Promise<void> {
	const fixture = await writtenFixture();
	await launched({ fixture, pid: LIVE_PID });

	const { launches } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(),
	);

	expect(launches).toEqual([
		{
			attempts: 3,
			caseId: "audit-log",
			id: LAUNCH_ID,
			kind: "launch",
			launchedAt: "2026-09-29T10:00:00.000Z",
			run: undefined,
			stage: undefined,
			status: "RUNNING",
			target: "case",
		},
	]);
}

async function verifyListsAReplayLaunchUnderTheRunAndStage(): Promise<void> {
	const fixture = await writtenFixture();
	await writeLaunchRecord(fixture.runsDirectory, {
		attempts: 1,
		id: LAUNCH_ID,
		kind: "replay",
		launchedAt: "2026-09-29T10:00:00.000Z",
		pid: LIVE_PID,
		run: fixture.replayableRun,
		stage: "build",
	});

	const { launches } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(),
	);

	const [observedFirstLaunch] = launches;

	expect(observedFirstLaunch).toMatchObject({
		caseId: undefined,
		run: fixture.replayableRun,
		stage: "build",
		target: "replay",
	});
}

async function verifyListsAComparisonLaunchUnderTheCheckpointItsArms(): Promise<void> {
	const fixture = await writtenFixture();
	await writeLaunchRecord(fixture.runsDirectory, {
		armA: "build-checkpoint-baseline",
		armB: "build-checkpoint-candidate",
		attempts: 2,
		id: LAUNCH_ID,
		kind: "comparison",
		launchedAt: "2026-09-29T10:00:00.000Z",
		pid: LIVE_PID,
		run: fixture.replayableRun,
		stage: "build",
	});

	const { launches } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(),
	);

	const [observedFirstLaunch] = launches;

	expect(observedFirstLaunch).toMatchObject({
		attempts: 2,
		caseId: undefined,
		run: fixture.replayableRun,
		stage: "build",
		target: "comparison",
	});
}

async function verifyListsARootCauseAnalysisLaunchAsOneCall(): Promise<void> {
	const fixture = await writtenFixture();
	await writeLaunchRecord(fixture.runsDirectory, {
		id: LAUNCH_ID,
		kind: "analysis",
		launchedAt: "2026-09-29T10:00:00.000Z",
		pid: LIVE_PID,
		run: fixture.replayableRun,
		usd: 1,
	});

	const { launches } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(),
	);

	const [observedFirstLaunch] = launches;

	expect(observedFirstLaunch).toMatchObject({
		attempts: 1,
		caseId: undefined,
		run: fixture.replayableRun,
		stage: undefined,
		target: "analysis",
	});
}

async function verifyDropsTheLaunchOnceItsProcessHasExited(): Promise<void> {
	const fixture = await writtenFixture();
	await launched({ fixture, pid: 999_999 });

	const { launches } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(),
	);

	expect(launches).toEqual([]);
}

async function verifyListsTheNewestLaunchFirst(): Promise<void> {
	const fixture = await writtenFixture();
	const older = "8a1c0000-0000-4000-8000-000000000002";
	const newer = "8a1c0000-0000-4000-8000-000000000003";
	await Array.fromAsync(
		[
			[older, "2026-09-29T09:00:00.000Z"],
			[newer, "2026-09-29T11:00:00.000Z"],
		] as const,
		async ([id, launchedAt]) => {
			await writeLaunchRecord(fixture.runsDirectory, {
				attempts: 1,
				caseId: "audit-log",
				id,
				kind: "case",
				launchedAt,
				pid: LIVE_PID,
			});
		},
	);

	const { launches } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(),
	);

	expect(launches.map(({ id }) => id)).toEqual([newer, older]);
}

async function verifyReportsALaunchRecordThatDoesNotReadBeside(): Promise<void> {
	const fixture = await writtenFixture();
	await mkdir(join(fixture.runsDirectory, "launches"), { recursive: true });
	await Bun.write(
		join(fixture.runsDirectory, "launches", `${LAUNCH_ID}.json`),
		"{}",
	);

	const { unreadable } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(),
	);

	expect(
		unreadable.filter(({ kind }) => kind === "launch").map(({ id }) => id),
	).toEqual([LAUNCH_ID]);
}

async function verifyLeavesTheLaunchOutOfAReportAskedFor(): Promise<void> {
	const fixture = await writtenFixture();
	await launched({ fixture, pid: LIVE_PID });

	const { launches } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(),
		new Set([`run:${fixture.replayableRun}`]),
	);

	expect(launches).toEqual([]);
}
