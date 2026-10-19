import { describe, expect, it } from "bun:test";

import { runEventRecorderFor } from "./run-events";
import ReturningJudgeProgressBuilder from "./run-events-progress-test-builder";
import recorderContext from "./run-events-recorder-test-fixture";
import RunEventResources from "./run-events-test-resources";

const INITIAL_EVENT_CURSOR = 0;

const resources = RunEventResources.forEachTest();

const reading = new ReturningJudgeProgressBuilder({
	sections: {
		dimensions: { returned: 3, total: 3 },
		hardBlockers: { returned: 1, total: 2 },
		requirements: { returned: 0, total: 1 },
	},
}).build();

async function recordsAStageStartWithTheIdOfTheSessionTheStageRunsUnder(): Promise<void> {
	const { store, ceiling } = await recorderContext(resources);

	runEventRecorderFor(store, "run-1", ceiling).recordStageStarted(
		"build",
		{ elapsedMs: 2000, spentUsd: 1 },
		"0b7e8d0c-2f4c-4a54-9a3e-6f1d2c3b4a59",
	);

	expect(
		store.latestStageStart({ runId: "run-1", stage: "build" }),
	).toMatchObject({
		elapsedMs: 2000,
		kind: "stage-started",
		sessionId: "0b7e8d0c-2f4c-4a54-9a3e-6f1d2c3b4a59",
		spentUsd: 1,
	});
}

async function appendsEveryRecordedCallToTheStoreUnderTheFixedRunId(): Promise<void> {
	const { store, ceiling } = await recorderContext(resources);
	const recorder = runEventRecorderFor(store, "run-1", ceiling);

	recorder.recordStageStarted(
		"shape",
		{ elapsedMs: 0, spentUsd: 0 },
		"shape-session",
	);
	recorder.record("stage-completed", "shape", {
		elapsedMs: 1000,
		spentUsd: 1,
	});

	expect(
		store
			.eventsSince("run-1", INITIAL_EVENT_CURSOR)
			.map(({ kind, stage, spentUsd, elapsedMs }) => ({
				elapsedMs,
				kind,
				spentUsd,
				stage,
			})),
	).toEqual([
		{ elapsedMs: 0, kind: "stage-started", spentUsd: 0, stage: "shape" },
		{ elapsedMs: 1000, kind: "stage-completed", spentUsd: 1, stage: "shape" },
	]);
}

async function stampsEveryEventWithTheRunSpendItsCeilingHasChargedSoFar(): Promise<void> {
	const expectedSpendAtStartUsd = 1.25;
	const expectedSpendAtCompletionUsd = 1.75;

	const secondChargedCallCostUsd = 0.5;

	const { store, ceiling } = await recorderContext(resources);
	const recorder = runEventRecorderFor(store, "run-1", ceiling);

	ceiling.charge(expectedSpendAtStartUsd);
	recorder.record("turn-completed", "build", {
		elapsedMs: 1000,
		spentUsd: 1.25,
	});
	ceiling.charge(secondChargedCallCostUsd);
	recorder.record("stage-completed", "build", {
		elapsedMs: 2000,
		spentUsd: 1.75,
	});

	expect(
		store
			.eventsSince("run-1", INITIAL_EVENT_CURSOR)
			.map(({ runSpentUsd }) => runSpentUsd),
	).toEqual([expectedSpendAtStartUsd, expectedSpendAtCompletionUsd]);
}

async function stampsEveryEventWithTheTokensItsCeilingHasTalliedSoFar(): Promise<void> {
	const chargedCallCostUsd = 1;

	const { store, ceiling } = await recorderContext(resources);
	const recorder = runEventRecorderFor(store, "run-1", ceiling);

	ceiling.charge(chargedCallCostUsd, {
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		costUsd: 1,
		inputTokens: 100,
		outputTokens: 20,
		turns: 1,
	});
	recorder.record("turn-completed", "build", {
		elapsedMs: 1000,
		spentUsd: 1,
	});

	expect(store.latestEvent("run-1")?.runTokens).toEqual({
		input: 100,
		output: 20,
	});
}

async function appendsAJudgeProgressReadingWithItsCounts(): Promise<void> {
	const { store, ceiling } = await recorderContext(resources);

	runEventRecorderFor(store, "run-1", ceiling).recordJudgeProgress(
		"build",
		{ elapsedMs: 3000, spentUsd: 2 },
		reading,
	);

	expect(store.eventsSince("run-1", INITIAL_EVENT_CURSOR)).toMatchObject([
		{
			elapsedMs: 3000,
			judge: reading,
			kind: "judge-progress",
			spentUsd: 2,
			stage: "build",
		},
	]);
}

async function dropsAJudgeProgressReadingTheStoreCannotTake(): Promise<void> {
	const { store, ceiling } = await recorderContext(resources);
	store.close();

	expect(() => {
		runEventRecorderFor(store, "run-1", ceiling).recordJudgeProgress(
			"build",
			{ elapsedMs: 3000, spentUsd: 2 },
			reading,
		);
	}).not.toThrow();
}

describe(runEventRecorderFor.name, () => {
	describe("when recording run progress and spending", () => {
		it(
			"records a stage start with the id of the session the stage runs under",
			recordsAStageStartWithTheIdOfTheSessionTheStageRunsUnder,
		);
		it(
			"appends every recorded call to the store under the fixed run id",
			appendsEveryRecordedCallToTheStoreUnderTheFixedRunId,
		);
		it(
			"stamps every event with the run spend its ceiling has charged so far",
			stampsEveryEventWithTheRunSpendItsCeilingHasChargedSoFar,
		);
		it(
			"stamps every event with the tokens its ceiling has tallied so far",
			stampsEveryEventWithTheTokensItsCeilingHasTalliedSoFar,
		);
		it(
			"appends a judge progress reading with its counts",
			appendsAJudgeProgressReadingWithItsCounts,
		);
		describe("when the event store is closed", () => {
			it(
				"drops a judge progress reading the store cannot take",
				dropsAJudgeProgressReadingTheStoreCannotTake,
			);
		});
	});
});
