import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import { GroupStoppedError } from "./confirmation-evidence";
import { operatorStopped } from "./operator-stop";
import runReplayConfirmation from "./replay-confirmation";
import ReplayCorpusBuilder from "./replay-confirmation-corpus-test-builder";
import ReplayConfirmationFixtureBuilder from "./replay-confirmation-fixture-builder";
import { groupTemporaryRoots, uniqueGroupId } from "./repository-test-fixtures";
import { confirmationGroupPaths } from "./run-layout";
import { TestResources } from "./test-support";

const FIRST_STOP_REQUEST_INDEX = 0;

const testResources = TestResources.forEachTest();

const deletesEveryRepWorktreeAndPrunesThemFromTheTarget =
	async (): Promise<void> => {
		const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
			testResources,
		);
		const corpusRoot = await new ReplayCorpusBuilder({
			files: [{ content: "discuss corpus\n", path: "skills/discuss/SKILL.md" }],
		}).build(testResources);
		const groupId = uniqueGroupId("confirmation-stopped");
		let leftover: readonly string[] = ["the stop never ran"];

		const { dependencies: replayDependencies, request: replayRequest } =
			harness.prepareConfirmation(
				{
					corpusRoots: [{ kind: "directory", root: corpusRoot }],
					paths: run.paths,
				},
				{ groupId, reps: 2 },
				(defaults) => ({
					...defaults,
					runStageJudge: async () => {
						await harness.stops[FIRST_STOP_REQUEST_INDEX]?.();
						leftover = await groupTemporaryRoots(groupId);

						throw new Error("stopped");
					},
				}),
			);

		await Promise.allSettled([
			runReplayConfirmation(replayDependencies, replayRequest),
		]);

		expect(leftover).toEqual([]);
		expect(new Set(harness.pruned)).toEqual(new Set([run.manifest.sourceRoot]));
	};

const recordsAnOperatorStopAndWritesNoGroupRecordOr =
	async (): Promise<void> => {
		const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
			testResources,
		);
		const corpusRoot = await new ReplayCorpusBuilder({
			files: [{ content: "discuss corpus\n", path: "skills/discuss/SKILL.md" }],
		}).build(testResources);
		const groupId = "confirmation-stopped-record";
		const paths = confirmationGroupPaths(run.paths.runsDirectory, groupId);

		const { dependencies: replayDependencies, request: replayRequest } =
			harness.prepareConfirmation(
				{
					corpusRoots: [{ kind: "directory", root: corpusRoot }],
					paths: run.paths,
				},
				{ groupId, reps: 2 },
				(defaults) => ({
					...defaults,
					runStageJudge: async () => {
						await harness.stops[FIRST_STOP_REQUEST_INDEX]?.();
						throw new Error("the stop killed this rep's judge");
					},
				}),
			);

		const outcome = await failureOf(
			runReplayConfirmation(replayDependencies, replayRequest),
		);

		expect(outcome).toBeInstanceOf(GroupStoppedError);
		expect(await operatorStopped(paths)).toBe(true);
		expect(await Bun.file(paths.groupFile).exists()).toBe(false);
		expect(await Bun.file(paths.reportFile).exists()).toBe(false);
	};

const removesItsWorktreesDirectoryWhenTheConfirmationBodyThrows =
	async (): Promise<void> => {
		const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
			testResources,
		);
		const corpusRoot = await new ReplayCorpusBuilder({
			files: [{ content: "discuss corpus\n", path: "skills/discuss/SKILL.md" }],
		}).build(testResources);
		const groupId = uniqueGroupId("confirmation-clock-failure");
		const { dependencies: replayDependencies, request: replayRequest } =
			harness.prepareConfirmation(
				{
					corpusRoots: [{ kind: "directory", root: corpusRoot }],
					paths: run.paths,
				},
				{
					groupId,
					now: () => {
						throw new Error("clock unavailable");
					},
				},
			);

		const execution = runReplayConfirmation(replayDependencies, replayRequest);

		expect(execution).rejects.toThrow("clock unavailable");
		const leftover = await groupTemporaryRoots(groupId);
		expect(leftover).toEqual([]);
	};
describe(runReplayConfirmation.name, () => {
	describe("stop and exception cleanup", () => {
		describe("when a signal stops it", () => {
			it(
				"deletes every rep worktree and prunes them from the target",
				deletesEveryRepWorktreeAndPrunesThemFromTheTarget,
			);

			it(
				"records an operator stop and writes no group record or report",
				recordsAnOperatorStopAndWritesNoGroupRecordOr,
			);
		});

		it(
			"removes its worktrees directory when the confirmation body throws",
			removesItsWorktreesDirectoryWhenTheConfirmationBodyThrows,
		);
	});
});
