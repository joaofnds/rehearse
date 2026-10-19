import { afterEach, describe, expect, it } from "bun:test";

import type { PlainRunEventKind } from "#benchmark/run-events";
import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { liveness } from "#server/history-claim-test-fixture";
import { pipelineRun } from "#server/history-record-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

const STAGE_START_ELAPSED_MS = 4000;

const TURN_COMPLETION_ELAPSED_MS = 9000;

/**
 * An event fires once per agent turn, which is minutes apart on a real run,
 * so a row rendering the event's own elapsed figure would sit frozen between
 * turns. The reading it was measured at travels with it, which is what lets
 * a watcher carry it forward.
 */

/**
 * `spentUsd` means a different thing in each event kind, so the figure
 * travels with the words describing what it covers. A reader that called
 * every one of these "spent this run" would report a number that falls when
 * a stage begins judging.
 */

const EVENT_STAGE_STATES = [
	["stage-started", "session running"],
	["turn-completed", "session running"],
	["stage-judging", "judge grading"],
	["stage-completed", "judged"],
] as const;

const EVENT_SPEND_SCOPES = [
	["stage-started", "the stages finished before this one"],
	["turn-completed", "this stage's session so far"],
	["stage-judging", "this stage's session"],
	["stage-completed", "this stage's session and its judge"],
] as const;

describe("history live timing", () => {
	it(
		"dates a running run's elapsed reading so a watcher can carry it forward",
		verifyDatesARunningRunSElapsedReadingSoA,
	);

	it(
		"measures the running stage's elapsed time from that stage's own start",
		verifyMeasuresTheRunningStageSElapsedTimeFromThat,
	);

	it.each(EVENT_STAGE_STATES)(
		"says a stage whose latest event is %s is in the state %s",
		verifyEventStageStates,
	);

	it.each(EVENT_SPEND_SCOPES)(
		"describes a spend reading from a %s event as covering %s",
		verifyEventSpendScopes,
	);

	it(
		"marks a finished run's row as recorded rather than running",
		verifyMarksAFinishedRunSRowAsRecordedRather,
	);
});

/**
 * An event fires once per agent turn, which is minutes apart on a real run,
 * so a row rendering the event's own elapsed figure would sit frozen between
 * turns. The reading it was measured at travels with it, which is what lets
 * a watcher carry it forward.
 */
async function verifyDatesARunningRunSElapsedReadingSoA(): Promise<void> {
	const fixture = await writtenFixture();
	const before = Date.now();
	await fixture.events.writeRunningRun();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		liveness(true, fixture.runningRun),
	);

	const row = pipelineRun(rows, fixture.runningRun);
	const measuredAt =
		row?.progress.state === "running"
			? Date.parse(row.progress.measuredAt)
			: Number.NaN;
	expect(measuredAt).toBeGreaterThanOrEqual(before);
	expect(measuredAt).toBeLessThanOrEqual(Date.now());
}

async function verifyMeasuresTheRunningStageSElapsedTimeFromThat(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun("stage-completed", "plan", {
		elapsedMs: 4000,
		spentUsd: 0.5,
	});
	await fixture.events.appendRunningEvent(
		"stage-started",
		"build",
		STAGE_START_ELAPSED_MS,
	);
	await fixture.events.appendRunningEvent(
		"turn-completed",
		"build",
		TURN_COMPLETION_ELAPSED_MS,
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		liveness(true, fixture.runningRun),
	);

	expect(pipelineRun(rows, fixture.runningRun)?.progress).toMatchObject({
		elapsedMs: 9000,
		stage: "build",
		stageElapsedMs: 5000,
	});
}

async function verifyMarksAFinishedRunSRowAsRecordedRather(): Promise<void> {
	const fixture = await writtenFixture();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	const row = pipelineRun(rows, fixture.replayableRun);
	expect(row?.progress).toEqual({ state: "recorded" });
}

async function verifyEventStageStates(
	kind: PlainRunEventKind,
	stageState: string,
): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun(kind);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		liveness(true, fixture.runningRun),
	);

	const row = pipelineRun(rows, fixture.runningRun);
	expect(row?.progress).toMatchObject({ stageState });
}

/**
 * `spentUsd` means a different thing in each event kind, so the figure
 * travels with the words describing what it covers. A reader that called
 * every one of these "spent this run" would report a number that falls when
 * a stage begins judging.
 */
async function verifyEventSpendScopes(
	kind: PlainRunEventKind,
	scope: string,
): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun(kind, "build", {
		elapsedMs: 4000,
		spentUsd: 1.25,
	});

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		liveness(true, fixture.runningRun),
	);

	const row = pipelineRun(rows, fixture.runningRun);
	expect(row?.progress).toMatchObject({ spendScope: scope });
}
