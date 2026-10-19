import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import { benchmarkRunPaths, checkpointRecordFile } from "#benchmark/run-layout";
import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { bindReplay, claimShortId } from "#benchmark/short-id";
import {
	clearHistoryRoots,
	corpusDirectory,
	fixtureWithClaimedRun,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

for (const [recordedBy, keptRecord] of [
	["its checkpoint", "checkpoint"],
	["its artifact's scorecard", "artifact"],
] as const) {
	it(`counts the original run's stage from ${recordedBy} alone`, async () => {
		const fixture = await fixtureWithClaimedRun();
		const paths = benchmarkRunPaths(
			fixture.runsDirectory,
			fixture.replayableRun,
		);
		await rm(
			keptRecord === "checkpoint"
				? paths.artifactFile
				: checkpointRecordFile(paths.checkpointDirectory("build")),
		);

		const { rows } = await runHistoryReport(
			{
				runsDirectory: fixture.runsDirectory,
				source: directorySource(await corpusDirectory("build skill\n")),
			},
			nothingRunning,
		);

		expect(
			rows.filter((row) => row.kind === "replay").map(({ attempt }) => attempt),
		).toEqual([{ count: 2, position: 2 }]);
	});
}

describe("history attempt order", () => {
	it(
		"names a replay's checkpoint and which attempt there it is, the original run's stage first",
		verifyNamesAReplaySCheckpointAndWhichAttemptThere,
	);

	it(
		"orders replays at a checkpoint by when they claimed, not by when they finished",
		verifyOrdersReplaysAtACheckpointByWhenTheyClaimed,
	);

	it(
		"counts judged reps of a stage-mode group claimed at the checkpoint, after the replays claimed before it",
		verifyCountsJudgedRepsOfAStageModeGroupClaimed,
	);

	it(
		"counts a run the Judge stopped at the replayed stage as an attempt there",
		verifyCountsARunTheJudgeStoppedAtTheReplayed,
	);

	it(
		"does not count a run whose judging failed at the replayed stage as an attempt there",
		verifyDoesNotCountARunWhoseJudgingFailedAt,
	);
});

async function verifyNamesAReplaySCheckpointAndWhichAttemptThere(): Promise<void> {
	const laterReplay = "2026-09-04T00-00-00.000Z";
	const fixture = await fixtureWithClaimedRun(async (earlier) => {
		await earlier.sessions.writeReplayOf({
			run: earlier.replayableRun,
			timestamp: laterReplay,
		});

		return [
			{
				kind: "attempt:stage",
				lineage: earlier.stageAttempt.lineage,
				timestamp: laterReplay,
			},
		];
	});

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(
		rows
			.filter((row) => row.kind === "replay")
			.map(({ shortId, checkpointShortId, attempt }) => ({
				attempt,
				checkpointShortId,
				shortId,
			})),
	).toEqual([
		{
			attempt: { count: 3, position: 3 },
			checkpointShortId: "audit-log/r2/s1",
			shortId: "audit-log/r5",
		},
		{
			attempt: { count: 3, position: 2 },
			checkpointShortId: "audit-log/r2/s1",
			shortId: "audit-log/r3",
		},
	]);
}

async function verifyOrdersReplaysAtACheckpointByWhenTheyClaimed(): Promise<void> {
	const fixture = await fixtureWithClaimedRun();
	const claimedFirst = "2026-09-20T00-00-00.000Z";
	const claimedSecond = "2026-09-19T00-00-00.000Z";
	await Array.fromAsync([claimedFirst, claimedSecond], async (timestamp) => {
		const id = await claimShortId(fixture.runsDirectory, "audit-log", {
			kind: "replay",
			run: fixture.replayableRun,
			stage: "build",
		});
		await fixture.sessions.writeReplayOf({
			run: fixture.replayableRun,
			timestamp,
		});
		await bindReplay(fixture.runsDirectory, id, {
			lineage: fixture.stageAttempt.lineage,
			timestamp,
		});
	});

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(
		rows
			.filter((row) => row.kind === "replay")
			.map(({ timestamp, attempt }) => ({ attempt, timestamp })),
	).toContainEqual({
		attempt: { count: 4, position: 3 },
		timestamp: claimedFirst,
	});
	expect(
		rows
			.filter((row) => row.kind === "replay")
			.map(({ timestamp, attempt }) => ({ attempt, timestamp })),
	).toContainEqual({
		attempt: { count: 4, position: 4 },
		timestamp: claimedSecond,
	});
}

async function verifyCountsJudgedRepsOfAStageModeGroupClaimed(): Promise<void> {
	const fixture = await fixtureWithClaimedRun();
	await fixture.confirmations.records.writeStageGroupWithReps("group-at-build");
	await claimShortId(fixture.runsDirectory, "audit-log", {
		groupId: "group-at-build",
		kind: "group",
		source: { run: fixture.replayableRun, stage: "build" },
	});

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(rows.find((row) => row.kind === "replay")?.attempt).toEqual({
		count: 3,
		position: 2,
	});
	expect(
		rows.find(
			(row) => row.kind === "group" && row.groupId === "group-at-build",
		),
	).toMatchObject({
		repAttempts: [
			{ attempt: { count: 3, position: 3 }, repId: "group-at-build-rep-1" },
		],
	});
}

async function verifyCountsARunTheJudgeStoppedAtTheReplayed(): Promise<void> {
	const fixture = await fixtureWithClaimedRun(async (earlier) => {
		await earlier.stopped.writeGradedStoppedRun();
		await earlier.sessions.writeReplayOf({
			run: earlier.stoppedRun,
			timestamp: "2026-09-05T00-00-00.000Z",
		});

		return [
			{ kind: "run", run: earlier.stoppedRun },
			{
				kind: "attempt:stage",
				lineage: earlier.stageAttempt.lineage,
				timestamp: "2026-09-05T00-00-00.000Z",
			},
		];
	});

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(
		rows.find(
			(row) =>
				row.kind === "replay" && row.timestamp === "2026-09-05T00-00-00.000Z",
		),
	).toMatchObject({ attempt: { count: 2, position: 2 } });
}

async function verifyDoesNotCountARunWhoseJudgingFailedAt(): Promise<void> {
	const fixture = await fixtureWithClaimedRun(async (earlier) => {
		await earlier.stopped.writeStoppedRun();
		await earlier.sessions.writeReplayOf({
			run: earlier.stoppedRun,
			timestamp: "2026-09-05T00-00-00.000Z",
		});

		return [
			{ kind: "run", run: earlier.stoppedRun },
			{
				kind: "attempt:stage",
				lineage: earlier.stageAttempt.lineage,
				timestamp: "2026-09-05T00-00-00.000Z",
			},
		];
	});

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(
		rows.find(
			(row) =>
				row.kind === "replay" && row.timestamp === "2026-09-05T00-00-00.000Z",
		),
	).toMatchObject({ attempt: { count: 1, position: 1 } });
}
