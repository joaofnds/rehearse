import { describe, expect, it } from "bun:test";
import { dirname } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { runReplay } from "./replay";
import ReplayConfirmationHarness from "./replay-confirmation-test-support";
import ReplaySavedRunBuilder from "./replay-saved-run-test-builder";
import { ReplayRequestBuilder } from "./replay-test-fixtures";
import { runNameFromTimestamp } from "./run-layout";
import { readShortIds } from "./short-id";
import { TestResources } from "./test-support";

const FIRST_CREATED_WORKTREE_INDEX = 0;

const testResources = TestResources.forEachTest();
const namesItsRecordByTheShortIdItClaimed = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder().build(testResources);
	const fake = new ReplayConfirmationHarness();

	const outcome = await runReplay(
		fake.dependencies,
		new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
	);

	expect(await readShortIds(run.paths.runsDirectory, "audit-log")).toEqual([
		{
			record: {
				kind: "attempt:stage",
				lineage: run.discuss.lineage,
				timestamp: runNameFromTimestamp(outcome.record.timestamp),
			},
			shortId: "audit-log/r1",
		},
	]);
};
const leavesItsShortIdNamingNothingAndTheNext = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder().build(testResources);
	const fake = new ReplayConfirmationHarness();
	const failing = {
		...fake.dependencies,
		runStageJudge: async () => await Promise.reject(new Error("judge died")),
	};

	await failureOf(
		runReplay(
			failing,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		),
	);
	testResources.track(
		dirname(fake.worktrees[FIRST_CREATED_WORKTREE_INDEX]?.path ?? "missing"),
	);
	const next = await runReplay(
		fake.dependencies,
		new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
	);
	const named = await readShortIds(run.paths.runsDirectory, "audit-log");

	expect(named.map(({ shortId, record }) => [shortId, record])).toEqual([
		[
			"audit-log/r2",
			{
				kind: "attempt:stage",
				lineage: run.discuss.lineage,
				timestamp: runNameFromTimestamp(next.record.timestamp),
			},
		],
	]);
};
describe(runReplay.name, () => {
	describe("short id records", () => {
		it(
			"names its record by the short id it claimed before its session ran",
			namesItsRecordByTheShortIdItClaimed,
		);
		describe("when the replay fails before its record is written", () => {
			it(
				"leaves its short id naming nothing, and the next claim above it",
				leavesItsShortIdNamingNothingAndTheNext,
			);
		});
	});
});
