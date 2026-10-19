import { afterEach, describe, expect, it } from "bun:test";

import {
	RECORDED_READINGS,
	STOPPED_RUN_EVIDENCE,
} from "#benchmark/run-records-test-support";
import { FINISHED_RUN } from "#server/run-ending-test-fixture";
import {
	EMPTY_METRIC_TOTAL,
	JUDGE_COST_USD,
	LATER_JUDGE_COST_USD,
	LATER_WORKER_COST_USD,
	WORKER_COST_USD,
	productOwnerMetrics,
	runElapsedMs,
	stageElapsedMs,
} from "#server/run-record-figures-test-fixture";
import {
	clearRunRecordRoots,
	emptyFixture,
	runRecord,
} from "#server/run-record-workspace-test-fixture";

afterEach(clearRunRecordRoots);

describe("run record new readings", () => {
	it(
		"serves each stage's and a stopped run's elapsed time",
		verifyServesEachStageSAndAStoppedRunS,
	);

	it(
		"serves the letter and verdict a stopped stage fell to, and the minimum grade",
		verifyServesTheLetterAndVerdictAStoppedStageFell,
	);

	it(
		"says whether each stage's letter reaches the run's minimum grade, as the run's gate decides",
		verifySaysWhetherEachStageSLetterReachesTheRun,
	);

	it(
		"sums a stopped run's cost and tokens with the Product Owner's spend up to the stop",
		verifySumsAStoppedRunSCostAndTokensWith,
	);

	it(
		"serves a finished run's elapsed time and minimum grade",
		verifyServesAFinishedRunSElapsedTimeAndMinimum,
	);
});

async function verifyServesEachStageSAndAStoppedRunS(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunWithReadings();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{
				stage: "discuss",
				wallTime: { ms: stageElapsedMs.discuss, state: "available" },
			},
			{
				stage: "build",
				wallTime: { ms: stageElapsedMs.build, state: "available" },
			},
		],
		totals: { wallTime: { ms: runElapsedMs, state: "available" } },
	});
}

async function verifyServesTheLetterAndVerdictAStoppedStageFell(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunWithReadings();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		minimumGrade: {
			letter: RECORDED_READINGS.minimumGrade,
			state: "available",
		},
		stages: [
			{ stage: "discuss" },
			{
				grade: {
					letter: RECORDED_READINGS.stoppedLetter,
					state: "available",
					verdict: "STOP",
				},
				stage: "build",
				status: "stopped",
			},
		],
	});
}

async function verifySaysWhetherEachStageSLetterReachesTheRun(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.pipeline.writeFinishedRunWithReadings(FINISHED_RUN);
	await fixture.pipeline.gradeBuildBelowRaisedMinimum(FINISHED_RUN);

	const response = await runRecord(fixture, FINISHED_RUN);

	expect(await response.json()).toMatchObject({
		stages: [
			{ grade: { letter: "A", reachesMinimum: true }, stage: "discuss" },
			{
				grade: {
					letter: "B",
					reachesMinimum: false,
					verdict: "CONTINUE",
				},
				stage: "build",
			},
		],
	});
}

async function verifySumsAStoppedRunSCostAndTokensWith(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunWithReadings();
	const judge = STOPPED_RUN_EVIDENCE.discussJudgeMetrics;
	const calls = [
		...STOPPED_RUN_EVIDENCE.discussSessionMetrics,
		judge,
		STOPPED_RUN_EVIDENCE.buildSessionMetrics,
		judge,
		productOwnerMetrics,
	];
	const sum = (
		field:
			| "inputTokens"
			| "cacheReadTokens"
			| "cacheWriteTokens"
			| "outputTokens",
	): number =>
		calls.reduce((total, call) => total + call[field], EMPTY_METRIC_TOTAL);

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		totals: {
			cost: {
				missing: [],
				state: "available",
				usd:
					WORKER_COST_USD +
					JUDGE_COST_USD +
					LATER_WORKER_COST_USD +
					LATER_JUDGE_COST_USD +
					RECORDED_READINGS.productOwnerCostUsd,
			},
			productOwnerCost: {
				state: "available",
				usd: RECORDED_READINGS.productOwnerCostUsd,
			},
			tokens: {
				cacheRead: sum("cacheReadTokens"),
				cacheWrite: sum("cacheWriteTokens"),
				input: sum("inputTokens"),
				missing: [],
				output: sum("outputTokens"),
				state: "available",
			},
		},
	});
}

async function verifyServesAFinishedRunSElapsedTimeAndMinimum(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.pipeline.writeFinishedRunWithReadings(FINISHED_RUN);

	const response = await runRecord(fixture, FINISHED_RUN);

	expect(await response.json()).toMatchObject({
		minimumGrade: {
			letter: RECORDED_READINGS.minimumGrade,
			state: "available",
		},
		stages: [
			{
				stage: "discuss",
				wallTime: { ms: stageElapsedMs.discuss, state: "available" },
			},
			{
				stage: "build",
				wallTime: { ms: stageElapsedMs.build, state: "available" },
			},
		],
		totals: {
			wallTime: { ms: runElapsedMs, state: "available" },
		},
	});
}
