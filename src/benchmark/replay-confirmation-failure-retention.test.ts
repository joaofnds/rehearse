import { describe, expect, it } from "bun:test";
import { stat } from "node:fs/promises";
import { dirname } from "node:path";

import { runCommand } from "./command";
import runReplayConfirmation from "./replay-confirmation";
import ReplayCheckpointInputsBuilder from "./replay-confirmation-checkpoint-test-builder";
import ReplaySetupFailures from "./replay-confirmation-setup-failure-test-fixture";
import { readReplayReps } from "./replay-confirmation-worktree-test-fixtures";
import { removeWorktree } from "./target";
import { TestResources } from "./test-support";

const FIRST_RECORDED_STAGE_INDEX = 0;
const SECOND_REP_RECORD_INDEX = 1;
const THIRD_REP_RECORD_INDEX = 2;
const FOURTH_REP_ORDINAL = 4;
const WORKER_FAILURE_REP_POSITION = 2;
const expectedFirstHealthyPeerOrdinal = 3;
const expectedLastHealthyPeerOrdinal = 4;
const expectedWorktreeCreatedCount = 3;
const expectedSplitCount = 3;
const testResources = TestResources.forEachTest();

const allowsUnaffectedPeersToFinish = async (): Promise<void> => {
	const inputs = await new ReplayCheckpointInputsBuilder({
		prefix: "rehearse-replay-failures-",
	}).fromRepository(testResources);
	const provider = new ReplaySetupFailures();
	const { dependencies, request } = provider.prepareConfirmation(
		inputs,
		{ groupId: "confirmation-failures", reps: 4 },
		provider.override,
		provider.failureOverride,
	);

	const outcome = await runReplayConfirmation(dependencies, request);
	const records = await readReplayReps(outcome.repRecordFiles);
	testResources.track(
		dirname(records[SECOND_REP_RECORD_INDEX]?.worktreePath ?? "missing"),
	);

	expect(provider.finished.toSorted((left, right) => left - right)).toEqual([
		expectedFirstHealthyPeerOrdinal,
		expectedLastHealthyPeerOrdinal,
	]);
	expect(
		records.map(({ stages }) => stages[FIRST_RECORDED_STAGE_INDEX]?.status),
	).toEqual([
		"EXECUTION_FAILED",
		"EXECUTION_FAILED",
		"EXECUTION_FAILED",
		"EXECUTION_FAILED",
	]);
	expect(provider.worktreeCreated).toHaveLength(expectedWorktreeCreatedCount);
};
const recordsThePhaseThatFailed = async (): Promise<void> => {
	const inputs = await new ReplayCheckpointInputsBuilder({
		prefix: "rehearse-replay-failures-",
	}).fromRepository(testResources);
	const provider = new ReplaySetupFailures();
	const { dependencies, request } = provider.prepareConfirmation(
		inputs,
		{ groupId: "confirmation-failures", reps: 4 },
		provider.override,
		provider.failureOverride,
	);

	const outcome = await runReplayConfirmation(dependencies, request);
	const records = await readReplayReps(outcome.repRecordFiles);
	testResources.track(
		dirname(records[SECOND_REP_RECORD_INDEX]?.worktreePath ?? "missing"),
	);
	const [first, second, third] = records;

	expect(first?.stages[FIRST_RECORDED_STAGE_INDEX]).toMatchObject({
		error: "worktree creation failed: synthetic worktree collision",
	});
	expect(second?.stages[FIRST_RECORDED_STAGE_INDEX]).toMatchObject({
		error: "checkpoint materialization failed: synthetic checkpoint rejection",
	});
	expect(third?.stages[FIRST_RECORDED_STAGE_INDEX]).toMatchObject({
		error: "worker failed before evidence",
	});
};
const removesOnlyACompletedJudgeOutcome = async (): Promise<void> => {
	const inputs = await new ReplayCheckpointInputsBuilder({
		prefix: "rehearse-replay-failures-",
	}).fromRepository(testResources);
	const provider = new ReplaySetupFailures();
	const { dependencies, request } = provider.prepareConfirmation(
		inputs,
		{ groupId: "confirmation-failures", reps: 4 },
		provider.override,
		provider.failureOverride,
	);

	const outcome = await runReplayConfirmation(dependencies, request);
	const records = await readReplayReps(outcome.repRecordFiles);
	const preservedPath =
		records[SECOND_REP_RECORD_INDEX]?.worktreePath ?? "missing";
	testResources.track(dirname(preservedPath));

	expect(
		provider.removed.toSorted((left, right) => left.localeCompare(right)),
	).toEqual(
		records
			.filter(({ ordinal }) => ordinal === FOURTH_REP_ORDINAL)
			.map(({ worktreePath }) => worktreePath)
			.toSorted((left, right) => left.localeCompare(right)),
	);

	await removeWorktree(inputs.sourceRoot, preservedPath);
	await removeWorktree(
		inputs.sourceRoot,
		records[THIRD_REP_RECORD_INDEX]?.worktreePath ?? "missing",
	);
};
const reportsEachPreservedFailurePath = async (): Promise<void> => {
	const inputs = await new ReplayCheckpointInputsBuilder({
		prefix: "rehearse-replay-failures-",
	}).fromRepository(testResources);
	const provider = new ReplaySetupFailures();
	const { dependencies, request } = provider.prepareConfirmation(
		inputs,
		{ groupId: "confirmation-failures", reps: 4 },
		provider.override,
		provider.failureOverride,
	);

	const outcome = await runReplayConfirmation(dependencies, request);
	const records = await readReplayReps(outcome.repRecordFiles);
	const preservedPath =
		records[SECOND_REP_RECORD_INDEX]?.worktreePath ?? "missing";
	testResources.track(dirname(preservedPath));
	const observedThirdRecord = records[WORKER_FAILURE_REP_POSITION];

	expect(provider.log).toContain(
		`Replay rep confirmation-failures-rep-2 failed; evidence preserved at ${preservedPath}`,
	);
	expect(provider.log).toContain(
		`Replay rep confirmation-failures-rep-3 failed; evidence preserved at ${observedThirdRecord?.worktreePath}`,
	);
};

const preservesIncompleteWorktrees = async (): Promise<void> => {
	const inputs = await new ReplayCheckpointInputsBuilder({
		prefix: "rehearse-replay-failures-",
	}).fromRepository(testResources);
	const provider = new ReplaySetupFailures();
	const { dependencies, request } = provider.prepareConfirmation(
		inputs,
		{ groupId: "confirmation-failures", reps: 4 },
		provider.override,
		provider.failureOverride,
	);

	const outcome = await runReplayConfirmation(dependencies, request);
	const records = await readReplayReps(outcome.repRecordFiles);
	testResources.track(
		dirname(records[SECOND_REP_RECORD_INDEX]?.worktreePath ?? "missing"),
	);
	const preserved = await stat(
		records[SECOND_REP_RECORD_INDEX]?.worktreePath ?? "missing",
	);
	const worktrees = await runCommand(
		["git", "worktree", "list", "--porcelain"],
		inputs.sourceRoot,
	);

	expect(
		worktrees.split("\n").filter((line) => line.startsWith("worktree ")),
	).toHaveLength(expectedSplitCount);
	expect(preserved.isDirectory()).toBe(true);
};
describe(runReplayConfirmation.name, () => {
	describe("pre-evidence failure retention", () => {
		it(
			"preserves incomplete worktrees and their repository registrations",
			preservesIncompleteWorktrees,
		);
		it("allows unaffected peers to finish", allowsUnaffectedPeersToFinish);
		it("records the phase that failed", recordsThePhaseThatFailed);
		it(
			"cleans completed Judge outcomes while preserving a pre-evidence failure",
			removesOnlyACompletedJudgeOutcome,
		);
		it("reports every preserved failure path", reportsEachPreservedFailurePath);
	});
});
