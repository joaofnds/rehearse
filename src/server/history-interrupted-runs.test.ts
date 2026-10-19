import { afterEach, describe, expect, it } from "bun:test";

import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";
import { pipelineRun } from "#server/history-record-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

describe("history interrupted runs", () => {
	it(
		"reports a run reconciled to INTERRUPTED, which today's checkpoint- and stage-file reads alone leave invisible",
		verifyReportsARunReconciledToINTERRUPTEDWhichTodayS,
	);

	it(
		"reports staleness from an interrupted run's initial checkpoint",
		verifyReportsStalenessFromAnInterruptedRunSInitialCheckpoint,
	);

	it(
		"lists a run reconciled to INTERRUPTED with no manifest as a row whose case is not recorded",
		verifyListsARunReconciledToINTERRUPTEDWithNoManifest,
	);

	it(
		"lists a run known only from a run-failed event as a FAILED row whose case is not recorded",
		verifyListsARunKnownOnlyFromARunFailed,
	);

	it(
		"names the last stage a failed run started when its failure event names none",
		verifyNamesTheLastStageAFailedRunStartedWhen,
	);

	it(
		"names no stage for a run that failed before starting one",
		verifyNamesNoStageForARunThatFailedBefore,
	);

	it(
		"lists a run that recorded no events and left a stage awaiting judgment as INTERRUPTED",
		verifyListsARunThatRecordedNoEventsAndLeft,
	);
});

async function verifyReportsARunReconciledToINTERRUPTEDWhichTodayS(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeInterruptedRun();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	const row = pipelineRun(rows, fixture.interruptedRun);
	expect(row).toMatchObject({ status: "INTERRUPTED" });
}

async function verifyReportsStalenessFromAnInterruptedRunSInitialCheckpoint(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeInterruptedRun();
	await fixture.pipeline.writeInitialCheckpoint(fixture.interruptedRun, {
		path: "stage-settings.json",
		sha256: "0".repeat(SHA256_HEX_DIGITS),
	});

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	const row = pipelineRun(rows, fixture.interruptedRun);
	expect(row).toMatchObject({
		caseId: "audit-log",
		checkpoints: [],
		corpusVersion: undefined,
		grade: undefined,
		kind: "run",
		links: [],
		progress: { state: "recorded" },
		run: fixture.interruptedRun,
		shortId: undefined,
		stage: undefined,
		staleness: {
			causes: ["stage settings file stage-settings.json changed"],
			stale: true,
			state: "available",
		},
		status: "INTERRUPTED",
	});
}

/**
 * The event table has no case column, so a run whose status comes from its
 * events and whose manifest never got written is a row whose case is not
 * recorded, rather than an entry that hides a run the operator started.
 */
async function verifyListsARunReconciledToINTERRUPTEDWithNoManifest(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeInterruptedRunWithoutManifest();

	const { rows, unreadable } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.interruptedRun)).toMatchObject({
		caseId: undefined,
		status: "INTERRUPTED",
	});
	expect(unreadable).toEqual([]);
}

async function verifyListsARunKnownOnlyFromARunFailed(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeEventsOnlyFailedRun();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.eventsOnlyRun)).toMatchObject({
		caseId: undefined,
		links: [
			{
				label: "shape",
				reason: "failed before saving its context",
				state: "unavailable",
			},
		],
		status: "FAILED",
	});
}

async function verifyNamesTheLastStageAFailedRunStartedWhen(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeEventsOnlyFailedRunNamingNoStage([
		"shape",
		"build",
	]);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.eventsOnlyRun)).toMatchObject({
		links: [
			{
				label: "build",
				reason: "failed before saving its context",
				state: "unavailable",
			},
		],
		status: "FAILED",
	});
}

async function verifyNamesNoStageForARunThatFailedBefore(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeEventsOnlyFailedRunNamingNoStage([]);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.eventsOnlyRun)).toMatchObject({
		links: [],
		status: "FAILED",
	});
}

async function verifyListsARunThatRecordedNoEventsAndLeft(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.stopped.writeAwaitingJudgeRun();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.awaitingJudgeRun)?.status).toBe(
		"INTERRUPTED",
	);
}
