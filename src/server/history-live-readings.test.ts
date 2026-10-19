import { afterEach, describe, expect, it } from "bun:test";

import type { JudgeProgress } from "#benchmark/run-events";
import { directorySource } from "#benchmark/run-records-test-support";
import { liveness } from "#server/history-claim-test-fixture";
import { pipelineRun } from "#server/history-record-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

describe("history live readings", () => {
	it(
		"reports a run in flight as RUNNING, carrying the case its manifest names",
		verifyReportsARunInFlightAsRUNNINGCarryingThe,
	);

	it(
		"carries the executing stage, elapsed time, and scoped spend on a running row",
		verifyCarriesTheExecutingStageElapsedTimeAndScopedSpend,
	);

	it(
		"carries the run spend charged so far against the ceiling the run started under",
		verifyCarriesTheRunSpendChargedSoFarAgainstThe,
	);

	it(
		"carries the run's tokens in and out at its latest event",
		verifyCarriesTheRunSTokensInAndOutAt,
	);

	it(
		"reports per rubric section how many of a judging stage's items are back, before its grade exists",
		verifyReportsPerRubricSectionHowManyOfAJudging,
	);

	it(
		"carries no judge reading while the stage has reported none",
		verifyCarriesNoJudgeReadingWhileTheStageHasReported,
	);
});

async function verifyReportsARunInFlightAsRUNNINGCarryingThe(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		liveness(true, fixture.runningRun),
	);

	const row = pipelineRun(rows, fixture.runningRun);
	expect(row).toMatchObject({
		caseId: "audit-log",
		run: fixture.runningRun,
		status: "RUNNING",
	});
}

async function verifyCarriesTheExecutingStageElapsedTimeAndScopedSpend(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun("turn-completed", "build", {
		elapsedMs: 9000,
		spentUsd: 0.9,
	});

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		liveness(true, fixture.runningRun),
	);

	const row = pipelineRun(rows, fixture.runningRun);
	expect(row?.progress).toMatchObject({
		elapsedMs: 9000,
		spendScope: "this stage's session so far",
		spentUsd: 0.9,
		stage: "build",
		state: "running",
	});
}

async function verifyCarriesTheRunSpendChargedSoFarAgainstThe(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRunUnderCeiling({
		runSpentUsd: 2.4,
		spendCeilingUsd: 10,
	});

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		liveness(true, fixture.runningRun),
	);

	const row = pipelineRun(rows, fixture.runningRun);
	expect(row?.progress).toMatchObject({
		ceilingUsd: 10,
		runSpentUsd: 2.4,
		state: "running",
	});
}

async function verifyCarriesTheRunSTokensInAndOutAt(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRunUnderCeiling({
		runSpentUsd: 2.4,
		runTokens: { input: 842_000, output: 31_000 },
		spendCeilingUsd: 10,
	});

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		liveness(true, fixture.runningRun),
	);

	const row = pipelineRun(rows, fixture.runningRun);
	expect(row?.progress).toMatchObject({
		runTokens: { input: 842_000, output: 31_000 },
		state: "running",
	});
}

async function verifyReportsPerRubricSectionHowManyOfAJudging(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun("stage-judging", "build", {
		elapsedMs: 9000,
		spentUsd: 0.9,
	});
	const judge: JudgeProgress = {
		attempt: 1,
		sections: {
			dimensions: { returned: 3, total: 5 },
			hardBlockers: { returned: 4, total: 4 },
			requirements: { returned: 0, total: 2 },
		},
		state: "returning",
	};
	await fixture.events.appendRunningJudgeProgress(judge);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		liveness(true, fixture.runningRun),
	);

	const row = pipelineRun(rows, fixture.runningRun);
	expect(row?.progress).toMatchObject({
		elapsedMs: 9500,
		judge,
		spendScope: "this stage's session",
		stage: "build",
		stageState: "judge grading",
		state: "running",
	});
}

async function verifyCarriesNoJudgeReadingWhileTheStageHasReported(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun("stage-judging");

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		liveness(true, fixture.runningRun),
	);

	expect(pipelineRun(rows, fixture.runningRun)?.progress).not.toHaveProperty(
		"judge",
	);
}
