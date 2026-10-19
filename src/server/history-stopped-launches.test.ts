import { afterEach, describe, expect, it } from "bun:test";

import type { LaunchRecord } from "#benchmark/launch-record";
import { writeLaunchRecord } from "#benchmark/launch-record";
import { directorySource } from "#benchmark/run-records-test-support";
import {
	LAUNCH_ID,
	LIVE_PID,
	launchLiveness,
} from "#server/history-launch-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

const STOPPED_LAUNCH_KINDS = [
	["a confirmation group", { attempts: 3 }],
	["a single case", { attempts: 1 }],
] as const;

describe("history stopped launches", () => {
	it.each(STOPPED_LAUNCH_KINDS)(
		"lists %s the operator stopped as OPERATOR_STOPPED once its process has exited",
		verifyStoppedLaunchKinds,
	);

	it(
		"lists a replay the operator stopped as OPERATOR_STOPPED once its process has exited",
		verifyListsAReplayTheOperatorStoppedAsOPERATORSTOPPED,
	);

	it(
		"keeps a launch RUNNING while its process outlives the stop request",
		verifyKeepsALaunchRUNNINGWhileItsProcessOutlivesThe,
	);
});

async function verifyListsAReplayTheOperatorStoppedAsOPERATORSTOPPED(): Promise<void> {
	const fixture = await writtenFixture();
	await writeLaunchRecord(fixture.runsDirectory, {
		attempts: 1,
		id: LAUNCH_ID,
		kind: "replay",
		launchedAt: "2026-09-29T10:00:00.000Z",
		pid: 999_999,
		run: fixture.replayableRun,
		stage: "build",
		stopRequestedAt: "2026-09-29T10:05:00.000Z",
	});

	const { launches } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(),
	);

	expect(launches.map(({ status }) => status)).toEqual(["OPERATOR_STOPPED"]);
}

async function verifyKeepsALaunchRUNNINGWhileItsProcessOutlivesThe(): Promise<void> {
	const fixture = await writtenFixture();
	await writeLaunchRecord(fixture.runsDirectory, {
		attempts: 3,
		caseId: "audit-log",
		id: LAUNCH_ID,
		kind: "case",
		launchedAt: "2026-09-29T10:00:00.000Z",
		pid: LIVE_PID,
		stopRequestedAt: "2026-09-29T10:05:00.000Z",
	});

	const { launches } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(),
	);

	expect(launches.map(({ status }) => status)).toEqual(["RUNNING"]);
}

async function verifyStoppedLaunchKinds(
	_target: string,
	launch: StoppedCaseLaunch,
): Promise<void> {
	const fixture = await writtenFixture();
	await writeLaunchRecord(fixture.runsDirectory, {
		caseId: "audit-log",
		id: LAUNCH_ID,
		kind: "case",
		launchedAt: "2026-09-29T10:00:00.000Z",
		pid: 999_999,
		stopRequestedAt: "2026-09-29T10:05:00.000Z",
		...launch,
	});

	const { launches } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(),
	);

	expect(launches).toEqual([
		{
			attempts: launch.attempts,
			caseId: "audit-log",
			id: LAUNCH_ID,
			kind: "launch",
			launchedAt: "2026-09-29T10:00:00.000Z",
			run: undefined,
			stage: undefined,
			status: "OPERATOR_STOPPED",
			target: "case",
		},
	]);
}

type StoppedCaseLaunch = Pick<
	Extract<LaunchRecord, { readonly kind: "case" }>,
	"attempts"
>;
