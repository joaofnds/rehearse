import { afterEach, describe, expect, it } from "bun:test";
import { cp } from "node:fs/promises";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import { recordPaused } from "#benchmark/run-pause";
import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { pipelineRun } from "#server/history-record-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { UNJUDGED_REASON, runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

describe("history stopped runs", () => {
	it(
		"links a failed run's saved stages once each, the stage it failed in included when that stage saved its context",
		verifyLinksAFailedRunSSavedStagesOnceEach,
	);

	it(
		"reports a run the operator paused with PAUSED:<stage> after its process ends",
		verifyReportsARunTheOperatorPausedWithPAUSEDStage,
	);

	it(
		"reports a run a signal stopped as OPERATOR_STOPPED rather than a failure",
		verifyReportsARunASignalStoppedAsOPERATORSTOPPED,
	);

	it(
		"reports a run stopped mid-stage with STOPPED:<stage> and no corpus version when its stage records name none",
		verifyReportsARunStoppedMidStageWithSTOPPEDStage,
	);
});

async function verifyLinksAFailedRunSSavedStagesOnceEach(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeSignalAbortedRun();
	const saved = benchmarkRunPaths(fixture.runsDirectory, fixture.replayableRun);
	const failed = benchmarkRunPaths(fixture.runsDirectory, fixture.abortedRun);
	await Array.fromAsync(["discuss", "build"], async (stage) => {
		await cp(
			saved.checkpointDirectory(stage),
			failed.checkpointDirectory(stage),
			{ recursive: true },
		);
	});

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.abortedRun)?.links).toEqual([
		{
			href: `/runs/${fixture.abortedRun}/stages/discuss`,
			label: "discuss",
			state: "available",
		},
		{
			href: `/runs/${fixture.abortedRun}/stages/build`,
			label: "build",
			state: "available",
		},
	]);
}

async function verifyReportsARunTheOperatorPausedWithPAUSEDStage(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun();
	await recordPaused(
		benchmarkRunPaths(fixture.runsDirectory, fixture.runningRun),
		"discuss",
		"2026-09-29T10:05:00.000Z",
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.runningRun)?.status).toBe("PAUSED:discuss");
}

async function verifyReportsARunASignalStoppedAsOPERATORSTOPPED(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun();
	await Bun.write(
		benchmarkRunPaths(fixture.runsDirectory, fixture.runningRun)
			.operatorStopFile,
		JSON.stringify({ signal: "SIGTERM", status: "OPERATOR_STOPPED" }),
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.runningRun)?.status).toBe(
		"OPERATOR_STOPPED",
	);
}

async function verifyReportsARunStoppedMidStageWithSTOPPEDStage(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.stopped.writeStoppedRun();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	const row = pipelineRun(rows, fixture.stoppedRun);
	expect(row).toMatchObject({ status: "STOPPED:build" });
	expect(row?.corpusVersion).toBeUndefined();
	expect(row?.staleness).toEqual({
		reasons: [UNJUDGED_REASON],
		state: "unavailable",
	});
	expect(row?.grade).toBeUndefined();
}
