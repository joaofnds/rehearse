import { afterEach, describe, expect, it } from "bun:test";

import { writeLaunchEnding } from "#benchmark/launch-ending";
import type { LaunchRecord } from "#benchmark/launch-record";
import { writeLaunchRecord } from "#benchmark/launch-record";
import { launchPaths } from "#benchmark/run-layout";
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
import type { LaunchRow } from "#server/run-history-contract";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

const DEAD_PID = 999_999;

const REFUSAL = "backlog contains a link, so it is not workflow state";

const ENDED_AT = "2026-09-29T10:00:02.000Z";

const STOP_ORDERS = [
	["its ending", "OPERATOR_STOPPED", ENDED_AT],
	["before its ending", "OPERATOR_STOPPED", "2026-09-29T10:00:01.000Z"],
	["after its ending", "ENDED", "2026-09-29T10:00:03.000Z"],
] as const;

describe("history ended launches", () => {
	it(
		"lists a case launch that ended by an error as ENDED with its message",
		verifyListsACaseLaunchThatEndedByAnError,
	);

	it(
		"lists an analysis launch that ended by an error as ENDED with its message",
		verifyListsAnAnalysisLaunchThatEndedByAnError,
	);

	it(
		"redacts private paths from the message it ended by",
		verifyRedactsPrivatePathsFromTheMessageItEndedBy,
	);

	it(
		"keeps a launch RUNNING while its process outlives its ending",
		verifyKeepsALaunchRUNNINGWhileItsProcessOutlivesItsEnding,
	);

	it(
		"reports an ending that does not read as unreadable",
		verifyReportsAnEndingThatDoesNotReadAsUnreadable,
	);

	describe("when the operator also stopped it", () => {
		it.each(STOP_ORDERS)(
			"lists a launch stopped at %s as %s",
			verifyListsAStoppedLaunchByWhichCameFirst,
		);
	});
});

async function caseLaunchThatEnded(launch: LaunchProcess): Promise<string> {
	const fixture = await writtenFixture();
	await writeLaunchRecord(fixture.runsDirectory, {
		attempts: 1,
		caseId: "audit-log",
		id: LAUNCH_ID,
		kind: "case",
		launchedAt: "2026-09-29T10:00:00.000Z",
		...launch,
	});
	await writeLaunchEnding(fixture.runsDirectory, LAUNCH_ID, {
		endedAt: ENDED_AT,
		exitCode: 1,
		message: REFUSAL,
	});

	return fixture.runsDirectory;
}

async function historyOf(
	runsDirectory: string,
): ReturnType<typeof runHistoryReport> {
	return await runHistoryReport(
		{
			runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(),
	);
}

async function verifyListsAStoppedLaunchByWhichCameFirst(
	_stop: string,
	status: LaunchRow["status"],
	stopRequestedAt: string,
): Promise<void> {
	const runsDirectory = await caseLaunchThatEnded({
		pid: DEAD_PID,
		stopRequestedAt,
	});

	const { launches } = await historyOf(runsDirectory);

	expect(launches.map((launch) => launch.status)).toEqual([status]);
}

async function verifyRedactsPrivatePathsFromTheMessageItEndedBy(): Promise<void> {
	const runsDirectory = await caseLaunchThatEnded({ pid: DEAD_PID });
	await writeLaunchEnding(runsDirectory, LAUNCH_ID, {
		endedAt: ENDED_AT,
		exitCode: 3,
		message: "Commit /Users/private/control before running the benchmark",
	});

	const { launches } = await historyOf(runsDirectory);

	expect(launches).toMatchObject([
		{ ending: { message: "Commit <path> before running the benchmark" } },
	]);
}

async function verifyKeepsALaunchRUNNINGWhileItsProcessOutlivesItsEnding(): Promise<void> {
	const runsDirectory = await caseLaunchThatEnded({ pid: LIVE_PID });

	const { launches } = await historyOf(runsDirectory);

	expect(launches.map((launch) => launch.status)).toEqual(["RUNNING"]);
}

async function verifyReportsAnEndingThatDoesNotReadAsUnreadable(): Promise<void> {
	const runsDirectory = await caseLaunchThatEnded({ pid: DEAD_PID });
	await Bun.write(launchPaths(runsDirectory, LAUNCH_ID).endingFile, "{");

	const { launches, unreadable } = await historyOf(runsDirectory);

	expect({ launches, unreadable }).toMatchObject({
		launches: [],
		unreadable: [{ id: LAUNCH_ID, kind: "launch" }],
	});
}

async function verifyListsACaseLaunchThatEndedByAnError(): Promise<void> {
	const runsDirectory = await caseLaunchThatEnded({ pid: DEAD_PID });

	const { launches } = await historyOf(runsDirectory);

	expect(launches).toEqual([
		{
			attempts: 1,
			caseId: "audit-log",
			ending: { exitCode: 1, message: REFUSAL },
			id: LAUNCH_ID,
			kind: "launch",
			launchedAt: "2026-09-29T10:00:00.000Z",
			run: undefined,
			stage: undefined,
			status: "ENDED",
			target: "case",
		},
	]);
}

async function verifyListsAnAnalysisLaunchThatEndedByAnError(): Promise<void> {
	const fixture = await writtenFixture();
	await writeLaunchRecord(fixture.runsDirectory, {
		id: LAUNCH_ID,
		kind: "analysis",
		launchedAt: "2026-09-29T10:00:00.000Z",
		pid: DEAD_PID,
		run: fixture.replayableRun,
		usd: 0.5,
	});
	await writeLaunchEnding(fixture.runsDirectory, LAUNCH_ID, {
		endedAt: ENDED_AT,
		exitCode: 3,
		message: "the model probe refused the call",
	});

	const { launches } = await historyOf(fixture.runsDirectory);

	expect(launches).toMatchObject([
		{
			ending: { exitCode: 3, message: "the model probe refused the call" },
			status: "ENDED",
			target: "analysis",
		},
	]);
}

type LaunchProcess = Pick<LaunchRecord, "pid" | "stopRequestedAt">;
