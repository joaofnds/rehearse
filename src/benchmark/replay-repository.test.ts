import { describe, expect, it } from "bun:test";

import { loadAttempts, presentAttempts } from "./attempts";
import { runCommand } from "./command";
import { readReplayRecord, runReplay } from "./replay";
import ReplayRepositoryProvider from "./replay-repository-provider-test-fixture";
import ReplayRepositoryBuilder, {
	readReplayRepositoryState,
} from "./replay-repository-test-builder";
import { ReplayRequestBuilder } from "./replay-test-fixtures";
import { benchmarkRunPaths } from "./run-layout";
import { TestResources } from "./test-support";

const expectedSplitCount = 1;
const expectedSize = 0;
const testResources = TestResources.forEachTest();
const leavesThePrimaryRepositoryUntouched = async (): Promise<void> => {
	const { primary, paths, manifest } =
		await new ReplayRepositoryBuilder().build(testResources);
	const provider = new ReplayRepositoryProvider(manifest);
	const before = await readReplayRepositoryState(primary);

	await runReplay(
		provider.repositoryDependencies,
		new ReplayRequestBuilder({
			instructions: "Replayed instructions\n",
			stage: "discuss",
		}).build(paths),
	);
	const after = await readReplayRepositoryState(primary);
	const worktrees = await runCommand(
		["git", "worktree", "list", "--porcelain"],
		primary,
	);

	expect(after).toEqual(before);
	expect(
		worktrees.split("\n").filter((line) => line.startsWith("worktree ")),
	).toHaveLength(expectedSplitCount);
	for (const message of provider.log) {
		expect(message).toMatch(/(?:[Cc]heckpoint|discuss stage Judge)/u);
	}
};
const recordsARealPlanningStageAndReleasesSignals = async (): Promise<void> => {
	const { paths, manifest, taskSha } =
		await new ReplayRepositoryBuilder().build(testResources);
	const provider = new ReplayRepositoryProvider(manifest);

	const outcome = await runReplay(
		provider.repositoryDependencies,
		new ReplayRequestBuilder({
			instructions: "Replayed instructions\n",
			stage: "discuss",
		}).build(paths),
	);
	const record = await readReplayRecord(outcome.recordPath);
	const [observedFirstJudged] = provider.judged;

	expect(record.consumed.stage).toBe("initial");
	expect(record.baseSha).toBe(taskSha);
	expect(observedFirstJudged?.artifact?.content).toBe("replayed spec\n");
	expect(provider.heldStops.size).toBe(expectedSize);
};
const indexesTheDurableReplayAmongStageAttempts = async (): Promise<void> => {
	const { parent, paths, manifest } = await new ReplayRepositoryBuilder().build(
		testResources,
	);
	const provider = new ReplayRepositoryProvider(manifest);

	const outcome = await runReplay(
		provider.repositoryDependencies,
		new ReplayRequestBuilder({
			instructions: "Replayed instructions\n",
			stage: "discuss",
		}).build(paths),
	);
	const record = await readReplayRecord(outcome.recordPath);
	const attempts2 = await presentAttempts(
		record.consumed.lineage,
		await loadAttempts(
			benchmarkRunPaths(parent, "run"),
			"discuss",
			record.consumed.lineage,
		),
	);

	expect(attempts2).toContain("replay ");
};

describe(runReplay.name, () => {
	describe("real repository replay", () => {
		it(
			"replays end to end against a real repository, leaving the primary untouched",
			leavesThePrimaryRepositoryUntouched,
		);
		it(
			"records the real stage artifact and returns signal handlers to their defaults",
			recordsARealPlanningStageAndReleasesSignals,
		);
		it(
			"indexes its durable replay among stage attempts",
			indexesTheDurableReplayAmongStageAttempts,
		);
	});
});
