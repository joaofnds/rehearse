import { describe, expect, it } from "bun:test";

import { runCommand } from "./command";
import runReplayConfirmation from "./replay-confirmation";
import ReplayConcurrentProvider from "./replay-confirmation-concurrent-provider-test-fixture";
import ReplayConcurrentWorkspaceBuilder, {
	FROZEN_REPLAY_RUBRIC,
	readPrimaryState,
} from "./replay-confirmation-concurrent-test-builder";
import {
	readReplayGroup,
	readReplayReps,
} from "./replay-confirmation-worktree-test-fixtures";
import { TestResources } from "./test-support";

const expectedConsumedInputCount = 3;
const expectedSize = 3;
const expectedSessionBudgetUsd = 5;
const expectedSplitCount = 1;
const testResources = TestResources.forEachTest();

const startsEachRepInItsOwnDetachedWorktree = async (): Promise<void> => {
	const inputs = await new ReplayConcurrentWorkspaceBuilder().build(
		testResources,
	);
	const provider = new ReplayConcurrentProvider();
	const { dependencies, request } = provider.prepareConfirmation(
		inputs,
		{ effort: "high", judgeEffort: "high" },
		provider.override,
	);

	const execution = runReplayConfirmation(dependencies, request);
	await provider.allStarted.promise;

	expect(provider.consumedInputs).toHaveLength(expectedConsumedInputCount);
	expect(
		new Set(provider.consumedInputs.map(({ targetDir }) => targetDir)).size,
	).toBe(expectedSize);
	expect(provider.consumedInputs.every(({ branch }) => branch === "")).toBe(
		true,
	);
	provider.release.resolve(true);
	await execution;
};
const recordsEveryConcurrentRepInRequestOrder = async (): Promise<void> => {
	const inputs = await new ReplayConcurrentWorkspaceBuilder().build(
		testResources,
	);
	const provider = new ReplayConcurrentProvider();
	provider.release.resolve(true);
	const { dependencies, request } = provider.prepareConfirmation(
		inputs,
		{ effort: "high", judgeEffort: "high" },
		provider.override,
	);

	const outcome = await runReplayConfirmation(dependencies, request);
	const records = await readReplayReps(outcome.repRecordFiles);

	expect(records.map(({ repId }) => repId)).toEqual([
		"confirmation-stage-1-rep-1",
		"confirmation-stage-1-rep-2",
		"confirmation-stage-1-rep-3",
	]);
	expect(new Set(outcome.repRecordFiles).size).toBe(expectedSize);
	expect(records.every(({ outcome: result }) => result === "SUCCESSFUL")).toBe(
		true,
	);
};
const consumesTheSameFrozenInputInEveryRep = async (): Promise<void> => {
	const inputs = await new ReplayConcurrentWorkspaceBuilder().build(
		testResources,
	);
	const provider = new ReplayConcurrentProvider();
	provider.release.resolve(true);
	const { dependencies, request } = provider.prepareConfirmation(
		inputs,
		{ effort: "high", judgeEffort: "high" },
		provider.override,
	);

	const outcome = await runReplayConfirmation(dependencies, request);
	const group = await readReplayGroup(outcome.groupRecordFile);

	expect(
		provider.consumedInputs.map(({ targetDir: _targetDir, ...input }) => input),
	).toEqual(
		Array.from({ length: 3 }, () => ({
			branch: "",
			budget: 5,
			checkpoint: "statuses: []\n",
			effort: "high",
			instructions: "Frozen instructions\n",
			model: "sonnet",
			rubric: FROZEN_REPLAY_RUBRIC.content,
			skill: "frozen discuss\n",
		})),
	);
	expect(group.inputs.lineage).toEqual({
		kind: "CHECKPOINT",
		lineage: inputs.initial.lineage,
		targetSha: inputs.taskSha,
	});
	expect(group.inputs.pipelinePath).toBe("pipelines/default.json");
	expect(group.inputs.sessionBudgetUsd).toBe(expectedSessionBudgetUsd);
};
const preservesThePrimaryCheckoutAndRemovesTemporaryWorktrees =
	async (): Promise<void> => {
		const inputs = await new ReplayConcurrentWorkspaceBuilder().build(
			testResources,
		);
		const provider = new ReplayConcurrentProvider();
		provider.release.resolve(true);
		const primaryBefore = await readPrimaryState(inputs.sourceRoot);
		const { dependencies, request } = provider.prepareConfirmation(
			inputs,
			{ effort: "high", judgeEffort: "high" },
			provider.override,
		);

		await runReplayConfirmation(dependencies, request);

		const primaryAfter = await readPrimaryState(inputs.sourceRoot);
		const worktrees = await runCommand(
			["git", "worktree", "list", "--porcelain"],
			inputs.sourceRoot,
		);

		expect(primaryAfter).toEqual(primaryBefore);
		expect(
			worktrees.split("\n").filter((line) => line.startsWith("worktree ")),
		).toHaveLength(expectedSplitCount);
	};

const recordsFrozenInputKindsAndProgress = async (): Promise<void> => {
	const inputs = await new ReplayConcurrentWorkspaceBuilder().build(
		testResources,
	);
	const provider = new ReplayConcurrentProvider();
	provider.release.resolve(true);
	const { dependencies, request } = provider.prepareConfirmation(
		inputs,
		{ effort: "high", judgeEffort: "high" },
		provider.override,
	);

	const outcome = await runReplayConfirmation(dependencies, request);
	const group = await readReplayGroup(outcome.groupRecordFile);

	expect(new Set(group.inputs.files.map(({ kind }) => kind))).toEqual(
		new Set([
			"checkpoint",
			"corpus",
			"rubric",
			"pipeline",
			"instructions",
			"task",
			"product-brief",
		]),
	);
	for (const message of provider.log) {
		expect(message).toMatch(/(?:[Cc]heckpoint|discuss stage Judge)/u);
	}
};

describe(runReplayConfirmation.name, () => {
	describe("concurrent frozen replay", () => {
		it(
			"records frozen input kinds and progress",
			recordsFrozenInputKindsAndProgress,
		);
		it(
			"starts every rep concurrently in its own detached worktree",
			startsEachRepInItsOwnDetachedWorktree,
		);
		it(
			"records concurrent reps in request order",
			recordsEveryConcurrentRepInRequestOrder,
		);
		it(
			"consumes the same frozen stage input in every rep",
			consumesTheSameFrozenInputInEveryRep,
		);
		it(
			"preserves the primary checkout and removes temporary worktrees",
			preservesThePrimaryCheckoutAndRemovesTemporaryWorktrees,
		);
	});
});
