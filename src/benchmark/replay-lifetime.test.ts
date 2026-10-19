import { describe, expect, it } from "bun:test";
import { access } from "node:fs/promises";
import { dirname } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import type { ReplayDependencies } from "./replay";
import { runReplay } from "./replay";
import { replayScorecard } from "./replay-confirmation-stage-test-harness";
import ReplayConfirmationHarness from "./replay-confirmation-test-support";
import ReplaySavedRunBuilder from "./replay-saved-run-test-builder";
import { ReplayRequestBuilder, SERVED_TARGET } from "./replay-test-fixtures";
import { TestResources } from "./test-support";

const FIRST_CREATED_WORKTREE_INDEX = 0;
const FIRST_STOP_REQUEST_INDEX = 0;
const testResources = TestResources.forEachTest();
const recordsASTOPVerdictAsAResultAndStill = async (): Promise<void> => {
	const expectedRemovedCount = 1;

	const run = await new ReplaySavedRunBuilder().build(testResources);
	const fake = new ReplayConfirmationHarness();
	const stopping: ReplayDependencies = {
		...fake.dependencies,
		runStageJudge: async (_execution, { input }) =>
			await Promise.resolve(replayScorecard(input, "STOP")),
	};

	const outcome = await runReplay(
		stopping,
		new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
	);

	expect(outcome.record.scorecard.grade.verdict).toBe("STOP");
	expect(fake.removed).toHaveLength(expectedRemovedCount);
};
const keepsTheWorktreeAndPrintsItsPathWhenThe = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder().build(testResources);
	const fake = new ReplayConfirmationHarness();
	const failing = {
		...fake.dependencies,
		runStageJudge: async () => await Promise.reject(new Error("judge died")),
	};

	expect(
		runReplay(
			failing,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		),
	).rejects.toThrow("judge died");

	expect(fake.removed).toEqual([]);
	const preserved = fake.log.find((line) =>
		line.includes("evidence preserved at"),
	);
	const [observedFirstWorktree] = fake.worktrees;

	expect(preserved).toContain(observedFirstWorktree?.path ?? "missing");
	testResources.track(
		dirname(fake.worktrees[FIRST_CREATED_WORKTREE_INDEX]?.path ?? "missing"),
	);
};
const returnsTheStopSignalsToTheirDefaultOnceIt = async (): Promise<void> => {
	const expectedStopCount = 1;

	const run = await new ReplaySavedRunBuilder().build(testResources);
	const fake = new ReplayConfirmationHarness();

	await runReplay(
		fake.dependencies,
		new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
	);

	expect(fake.stops).toHaveLength(expectedStopCount);
	expect([...fake.releasedStops]).toEqual(fake.stops);
};
const removesItsWorktree = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder().build(testResources);
	const fake = new ReplayConfirmationHarness();
	const stopped = {
		...fake.dependencies,
		runStageJudge: async () => {
			await fake.stops[FIRST_STOP_REQUEST_INDEX]?.();
			throw new Error("stopped");
		},
	};

	expect(
		runReplay(
			stopped,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		),
	).rejects.toThrow("stopped");

	const worktree =
		fake.worktrees[FIRST_CREATED_WORKTREE_INDEX]?.path ?? "missing";
	expect(fake.removed).toEqual([worktree]);
	expect(access(dirname(worktree))).rejects.toThrow("ENOENT");
};
const removesItsContainers = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder({ target: SERVED_TARGET }).build(
		testResources,
	);
	const fake = new ReplayConfirmationHarness();
	let running: readonly string[] = ["the stop never ran"];
	const stopped = {
		...fake.dependencies,
		runStageJudge: async () => {
			await fake.stops[FIRST_STOP_REQUEST_INDEX]?.();
			running = fake.containers.runningServices();

			throw new Error("stopped");
		},
	};

	await failureOf(
		runReplay(
			stopped,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		),
	);

	expect(running).toEqual([]);
};
describe(runReplay.name, () => {
	describe("worktree and signal lifetime", () => {
		it(
			"records a STOP verdict as a result and still removes the worktree",
			recordsASTOPVerdictAsAResultAndStill,
		);
		it(
			"keeps the worktree and prints its path when the replay fails before grading",
			keepsTheWorktreeAndPrintsItsPathWhenThe,
		);
		it(
			"returns the stop signals to their default once it finishes",
			returnsTheStopSignalsToTheirDefaultOnceIt,
		);
		describe("when a signal stops it", () => {
			it("removes its worktree", removesItsWorktree);
		});
		describe("when a signal stops it", () => {
			it("removes its containers", removesItsContainers);
		});
	});
});
