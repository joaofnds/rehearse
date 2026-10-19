import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import { openRunEventStore } from "#benchmark/run-events";
import {
	benchmarkRunPaths,
	checkpointRecordFile,
	runEventsDatabaseFile,
} from "#benchmark/run-layout";
import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { pipelineRun, stageLink } from "#server/history-record-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

describe(runHistoryReport.name, () => {
	describe("when a pipeline run retains stage records", () => {
		describe(
			"replayable stages on a pipeline run",
			registerHistoryStageLinksReplayableStagesOnAPipelineRun,
		);

		describe(
			"stage links on a pipeline run",
			registerHistoryStageLinksStageLinksOnAPipelineRun,
		);
	});
});

async function verifyNamesEachStageWhoseStartingCheckpointIsRecordedIn(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.pipeline.writeInitialCheckpoint();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.replayableRun)).toMatchObject({
		replayableStages: ["discuss", "build"],
		shortId: undefined,
	});
}

async function verifyLeavesOutTheFirstStageWhileTheInitialCheckpoint(): Promise<void> {
	const fixture = await writtenFixture();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.replayableRun)?.replayableStages).toEqual([
		"build",
	]);
}

async function verifyLinksEachStageThatSavedACheckpointInPipeline(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.pipeline.writeInitialCheckpoint();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.replayableRun)?.links).toEqual([
		stageLink(fixture.replayableRun, "discuss"),
		stageLink(fixture.replayableRun, "build"),
	]);
}

async function verifyDoesNotLinkAStageDirectoryThatHoldsNo(): Promise<void> {
	const fixture = await writtenFixture();
	await rm(
		checkpointRecordFile(
			benchmarkRunPaths(
				fixture.runsDirectory,
				fixture.replayableRun,
			).checkpointDirectory("discuss"),
		),
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.replayableRun)?.links).toEqual([
		stageLink(fixture.replayableRun, "build"),
	]);
}

async function verifyLinksTheStageThatStoppedTheRunWhosePage(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.stopped.writeStoppedRun();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.stoppedRun)?.links).toEqual([
		stageLink(fixture.stoppedRun, "build"),
	]);
}

async function verifyLinksAStageLeftAwaitingJudgmentByARun(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.stopped.writeAwaitingJudgeRun();
	const store = await openRunEventStore(
		runEventsDatabaseFile(fixture.runsDirectory),
	);
	store.append({
		elapsedMs: 5000,
		kind: "run-interrupted",
		runId: fixture.awaitingJudgeRun,
		spentUsd: 1,
		stage: "build",
	});
	store.close();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.awaitingJudgeRun)).toMatchObject({
		links: [stageLink(fixture.awaitingJudgeRun, "build")],
		status: "INTERRUPTED",
	});
}

function registerHistoryStageLinksReplayableStagesOnAPipelineRun(): void {
	it(
		"names each stage whose starting checkpoint is recorded, in pipeline order, though the run claimed no short id",
		verifyNamesEachStageWhoseStartingCheckpointIsRecordedIn,
	);

	it(
		"leaves out the first stage while the initial checkpoint is not recorded",
		verifyLeavesOutTheFirstStageWhileTheInitialCheckpoint,
	);
}

function registerHistoryStageLinksStageLinksOnAPipelineRun(): void {
	it(
		"links each stage that saved a checkpoint, in pipeline order, and never the initial checkpoint",
		verifyLinksEachStageThatSavedACheckpointInPipeline,
	);

	it(
		"does not link a stage directory that holds no checkpoint record",
		verifyDoesNotLinkAStageDirectoryThatHoldsNo,
	);

	it(
		"links the stage that stopped the run, whose page renders from its stop record",
		verifyLinksTheStageThatStoppedTheRunWhosePage,
	);

	it(
		"links a stage left awaiting judgment by a run that was interrupted while judging",
		verifyLinksAStageLeftAwaitingJudgmentByARun,
	);
}
