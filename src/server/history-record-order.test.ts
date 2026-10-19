import { afterEach, describe, expect, it } from "bun:test";

import { confirmationGroupPaths } from "#benchmark/run-layout";
import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { recordStartedAt, rowName } from "#server/history-record-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

describe("history record order", () => {
	it(
		"orders runs and replays newest first, then attempts and groups",
		verifyOrdersRunsAndReplaysNewestFirstThenAttemptsAnd,
	);

	it(
		"lists a session attempt that records its start time among the runs by that time",
		verifyListsASessionAttemptThatRecordsItsStartTime,
	);

	it(
		"lists a confirmation group that records its start time among the runs and replays by that time",
		verifyListsAConfirmationGroupThatRecordsItsStartTime,
	);

	it(
		"places a run, a group and an attempt from one hour by when each started",
		verifyPlacesARunAGroupAndAnAttemptFrom,
	);
});

/**
 * Runs and replays carry a timestamp in their identity. These session
 * attempts and confirmation runs record no start time, so they follow in
 * listing order rather than being placed by a time the records do not hold.
 */
async function verifyOrdersRunsAndReplaysNewestFirstThenAttemptsAnd(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.stopped.writeStoppedRun();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(rows.map((row) => rowName(row))).toEqual([
		`run ${fixture.stoppedRun}`,
		`replay ${fixture.stageAttempt.timestamp}`,
		`run ${fixture.replayableRun}`,
		`run ${fixture.unreplayableRun}`,
		`attempt ${fixture.sessionAttempt.uuid}`,
		`group ${fixture.groupId}`,
	]);
}

async function verifyListsASessionAttemptThatRecordsItsStartTime(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.stopped.writeStoppedRun();
	await fixture.sessions.recordAttemptStartedAt("2026-09-02T12:00:00.000Z");

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(rows.map((row) => rowName(row))).toEqual([
		`run ${fixture.stoppedRun}`,
		`replay ${fixture.stageAttempt.timestamp}`,
		`run ${fixture.replayableRun}`,
		`attempt ${fixture.sessionAttempt.uuid}`,
		`run ${fixture.unreplayableRun}`,
		`group ${fixture.groupId}`,
	]);
}

async function verifyListsAConfirmationGroupThatRecordsItsStartTime(): Promise<void> {
	const fixture = await writtenFixture();
	await recordStartedAt(
		confirmationGroupPaths(fixture.runsDirectory, fixture.groupId).groupFile,
		"2026-09-03T00:30:00.000Z",
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(rows.map((row) => rowName(row))).toEqual([
		`replay ${fixture.stageAttempt.timestamp}`,
		`group ${fixture.groupId}`,
		`run ${fixture.replayableRun}`,
		`run ${fixture.unreplayableRun}`,
		`attempt ${fixture.sessionAttempt.uuid}`,
	]);
}

async function verifyPlacesARunAGroupAndAnAttemptFrom(): Promise<void> {
	const fixture = await writtenFixture();
	const laterRun = "2026-09-02T00-45-00.000Z";
	await fixture.pipeline.writeFinishedRunEvidence(laterRun);
	await fixture.sessions.recordAttemptStartedAt("2026-09-02T00:15:00.000Z");
	await recordStartedAt(
		confirmationGroupPaths(fixture.runsDirectory, fixture.groupId).groupFile,
		"2026-09-02T00:30:00.000Z",
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(rows.map((row) => rowName(row))).toEqual([
		`replay ${fixture.stageAttempt.timestamp}`,
		`run ${fixture.replayableRun}`,
		`run ${laterRun}`,
		`group ${fixture.groupId}`,
		`attempt ${fixture.sessionAttempt.uuid}`,
		`run ${fixture.unreplayableRun}`,
	]);
}
