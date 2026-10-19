import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";

import { DIGEST, renderGraph } from "./monitor-graph-test-fixtures";
import {
	RUN,
	graphNode,
	originalFetch,
	renderAppWithStub,
	renderMonitor,
} from "./monitor-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
});

describe("/monitor task graph", () => {
	it(
		"shows a stage not started as costing nothing, with no checkpoint yet",
		showsAStageNotStartedAsCostingNothingWithNoCheckpointYet,
	);

	it(
		"shows the running stage's duration advancing from the run's latest measurement, and a finished one's as recorded",
		showsTheRunningStageSDurationAdvancingFromTheRunSLatestMeasurementAndAFinishedOneSAsRecorded,
	);

	it(
		"shows the running stage's session spend so far as its cost",
		showsTheRunningStageSSessionSpendSoFarAsItsCost,
	);

	it(
		"shows on the running stage, which has measured none of its own yet, the corpus version the header names",
		showsOnTheRunningStageWhichHasMeasuredNoneOfItsOwnYetTheCorpusVersionTheHeaderNames,
	);

	it(
		"reads a stage not started as having no corpus version",
		readsAStageNotStartedAsHavingNoCorpusVersion,
	);

	describe("when the running stage's latest event is not one of its session's turns", () => {
		it(
			"shows a stage that has only just started as costing nothing yet, not what the stages before it spent",
			showsAStageThatHasOnlyJustStartedAsCostingNothingYetNotWhatTheStagesBeforeItSpent,
		);

		it(
			"shows a stage whose judge is grading as costing its whole session",
			showsAStageWhoseJudgeIsGradingAsCostingItsWholeSession,
		);

		it(
			"shows a judged stage whose record is not written yet as costing its session and its judge",
			showsAJudgedStageWhoseRecordIsNotWrittenYetAsCostingItsSessionAndItsJudge,
		);
	});
});

async function showsTheRunningStageSDurationAdvancingFromTheRunSLatestMeasurementAndAFinishedOneSAsRecorded(): Promise<void> {
	setSystemTime(new Date("2026-09-30T10:07:12.000Z"));
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/run-listing",
			new NamedHistoryBuilder({
				rows: [
					new PipelineRunRowBuilder({ run: RUN })
						.withExecutionProgress({
							measuredAt: "2026-09-30T10:06:12.000Z",
							stage: "build",
							stageElapsedMs: 182_000,
						})
						.build(),
				],
			}).build(),
		],
		[
			`/api/runs/${RUN}`,
			new RunRecordBuilder({
				run: RUN,
				stages: [
					new RunRecordStageBuilder({
						stage: "plan",

						status: "graded",
						wallTime: { ms: 125_000, state: "available" },
					}).build(),
					new RunRecordStageBuilder().build(),
				],
			}).build(),
		],
	]);
	renderAppWithStub("/monitor", fetchReplies);

	expect(await graphNode("build")).toHaveTextContent("4m02s");
	expect(await graphNode("plan")).toHaveTextContent("2m05s");
}

async function showsAStageThatHasOnlyJustStartedAsCostingNothingYetNotWhatTheStagesBeforeItSpent(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({
				spendScope: "the stages finished before this one",
				spentUsd: 1.1,
				stage: "build",
			})
			.build(),
	);

	expect(await graphNode("build")).toHaveTextContent("$0.00");
}

async function showsAStageWhoseJudgeIsGradingAsCostingItsWholeSession(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({
				spendScope: "this stage's session",
				spentUsd: 1.4,
				stage: "build",
				stageState: "judge grading",
			})
			.build(),
	);

	expect(await graphNode("build")).toHaveTextContent("$1.40");
}

async function showsAJudgedStageWhoseRecordIsNotWrittenYetAsCostingItsSessionAndItsJudge(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({
				spendScope: "this stage's session and its judge",
				spentUsd: 1.9,
				stage: "build",
				stageState: "judged",
			})
			.build(),
	);

	expect(await graphNode("build")).toHaveTextContent("$1.90");
}

async function showsAStageNotStartedAsCostingNothingWithNoCheckpointYet(): Promise<void> {
	renderGraph([
		new RunRecordStageBuilder().build(),
		new RunRecordStageBuilder({ stage: "review" }).build(),
	]);

	const shown = await graphNode("review");

	expect(shown).toHaveTextContent("$0.00");
	expect(shown).toHaveTextContent("◇no checkpoint yet");
	expect(shown).toHaveTextContent("not started");
}

async function showsTheRunningStageSSessionSpendSoFarAsItsCost(): Promise<void> {
	renderGraph([new RunRecordStageBuilder().build()]);

	expect(await graphNode("build")).toHaveTextContent("$0.90");
}

async function showsOnTheRunningStageWhichHasMeasuredNoneOfItsOwnYetTheCorpusVersionTheHeaderNames(): Promise<void> {
	const latest: CorpusMeasurement = {
		digest: "b".repeat(SHA256_HEX_CHARACTERS),
		kind: "version",
	};
	renderGraph(
		[
			new RunRecordStageBuilder({
				corpusVersion: latest,
				stage: "plan",
				status: "graded",
			}).build(),
			new RunRecordStageBuilder().build(),
		],
		{ runUnder: latest },
	);

	expect(await graphNode("build")).toHaveTextContent("bbbbbb");
}

async function readsAStageNotStartedAsHavingNoCorpusVersion(): Promise<void> {
	renderGraph(
		[
			new RunRecordStageBuilder().build(),
			new RunRecordStageBuilder({ stage: "review" }).build(),
		],
		{
			runUnder: {
				digest: DIGEST,
				kind: "version",
			},
		},
	);

	expect(await graphNode("review")).toHaveTextContent("version not recorded");
}
