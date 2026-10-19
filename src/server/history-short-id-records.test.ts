import { afterEach, describe, expect, it } from "bun:test";

import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { claimShortId } from "#benchmark/short-id";
import { pipelineRun } from "#server/history-record-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	fixtureWithClaimedRun,
	laterRun,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import type { ConfirmationGroupRow } from "./run-history";
import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

describe("history short id records", () => {
	it(
		"names each record of a claimed case by its short id",
		verifyNamesEachRecordOfAClaimedCaseByIts,
	);

	it(
		"names each checkpoint of a claimed run by its stage number",
		verifyNamesEachCheckpointOfAClaimedRunByIts,
	);

	it(
		"names the checkpoint a stage group replayed, and none for a group whose claim records none",
		verifyNamesTheCheckpointAStageGroupReplayedAndNone,
	);

	it(
		"names each rep of a session-mode group by its position in the group",
		verifyNamesEachRepOfASessionModeGroupBy,
	);

	it(
		"names no short id for a record no claim names in a claimed case",
		verifyNamesNoShortIdForARecordNoClaim,
	);

	it(
		"names no short id for a record in a case no command has claimed in",
		verifyNamesNoShortIdForARecordInA,
	);
});

async function verifyNamesEachRecordOfAClaimedCaseByIts(): Promise<void> {
	const fixture = await fixtureWithClaimedRun();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(
		rows.filter((row) => row.caseId === "audit-log").map((row) => row.shortId),
	).toEqual([
		"audit-log/r5",
		"audit-log/r3",
		"audit-log/r2",
		"audit-log/r1",
		"audit-log/g4",
	]);
}

async function verifyNamesEachCheckpointOfAClaimedRunByIts(): Promise<void> {
	const fixture = await fixtureWithClaimedRun();
	await fixture.pipeline.writeInitialCheckpoint(laterRun);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, laterRun)?.checkpoints).toEqual([
		{ shortId: "audit-log/r5/s0", stage: "initial" },
		{ shortId: "audit-log/r5/s1", stage: "discuss" },
		{ shortId: "audit-log/r5/s2", stage: "build" },
	]);
}

async function verifyNamesTheCheckpointAStageGroupReplayedAndNone(): Promise<void> {
	const fixture = await fixtureWithClaimedRun();
	await fixture.confirmations.records.writeStageGroupWithReps("group-at-build");
	await claimShortId(fixture.runsDirectory, "audit-log", {
		groupId: "group-at-build",
		kind: "group",
		source: { run: fixture.replayableRun, stage: "build" },
	});
	await fixture.confirmations.records.writeSessionGroup("group-s");

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);
	const checkpointOf = (
		groupId: string,
	): ConfirmationGroupRow["checkpoint"] | "no row" => {
		const row = rows.find(
			(candidate) =>
				candidate.kind === "group" && candidate.groupId === groupId,
		);

		return row?.kind === "group" ? row.checkpoint : "no row";
	};

	expect(checkpointOf("group-at-build")).toEqual({
		run: fixture.replayableRun,
		stage: "build",
	});
	expect(checkpointOf("group-s")).toBeUndefined();
}

async function verifyNamesEachRepOfASessionModeGroupBy(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.confirmations.records.writeSessionGroup("group-s");

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(
		rows.find((row) => row.kind === "group" && row.groupId === "group-s"),
	).toMatchObject({
		repAttempts: [
			{ attempt: { count: 2, position: 1 }, repId: "group-s-rep-1" },
			{ attempt: { count: 2, position: 2 }, repId: "group-s-rep-2" },
		],
	});
}

async function verifyNamesNoShortIdForARecordNoClaim(): Promise<void> {
	const fixture = await writtenFixture();
	await claimShortId(fixture.runsDirectory, "audit-log", {
		kind: "run",
		run: laterRun,
	});
	await fixture.pipeline.writePipelineRun({
		caseId: "audit-log",
		run: laterRun,
	});

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(
		rows.filter((row) => row.caseId === "audit-log").map((row) => row.shortId),
	).toEqual(["audit-log/r1", undefined, undefined, undefined, undefined]);
}

async function verifyNamesNoShortIdForARecordInA(): Promise<void> {
	const fixture = await fixtureWithClaimedRun();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(rows.find((row) => row.kind === "session-attempt")).toMatchObject({
		caseId: "smoke",
		shortId: undefined,
	});
}
