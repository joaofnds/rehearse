import { describe, expect, it } from "bun:test";
import { basename } from "node:path";

import { GroupStoppedError } from "./confirmation-evidence";
import { operatorStopped } from "./operator-stop";
import runPipelineConfirmation from "./pipeline-confirmation";
import PipelineSignalProbe from "./pipeline-confirmation-signal-test-probe";
import {
	PipelineConfirmationHarness,
	SERVED_CONFIRMATION_PIPELINE,
} from "./pipeline-confirmation-test-support";
import { remainingConfirmationRoots } from "./pipeline-confirmation-workspace-test-fixture";
import { confirmationGroupPaths } from "./run-layout";
import { TestResources } from "./test-support";

const FIRST_STOP_REQUEST_INDEX = 0;

const testResources = TestResources.forEachTest();

async function removesTheTemporaryRootWhenStoppedDuringGroupSetup(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const groupId = "pipeline-stopped";
	let leftover: readonly string[] = ["the stop never ran"];

	await Promise.allSettled([
		harness.run({ groupId }, (dependencies) => ({
			...dependencies,
			runSetup: async () => {
				await harness.stops[FIRST_STOP_REQUEST_INDEX]?.();
				leftover = await remainingConfirmationRoots(groupId);

				throw new Error("stopped");
			},
		})),
	]);

	expect(leftover).toEqual([]);
	expect(new Set(harness.pruned)).toEqual(new Set([harness.sourceRoot]));
}

async function deletesEveryCreatedRepWorktreeAndPrunesItsGitRegistration(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const reps = 3;
	const probe = new PipelineSignalProbe({
		expectedReps: reps,
		sourceRoot: harness.sourceRoot,
	});

	const outcome = harness.run(
		{ groupId: "pipeline-stopped-created-reps", reps },
		probe.override,
	);

	expect(outcome).rejects.toBeInstanceOf(GroupStoppedError);
	expect(probe.createdWorktrees).toHaveLength(reps);
	expect(probe.presenceBeforeStop).toEqual([true, true, true]);
	expect(probe.registrationsBeforeStop.toSorted()).toEqual(
		[await probe.sourceRoot, ...probe.createdWorktrees].toSorted(),
	);
	expect(probe.presenceAfterStop).toEqual([false, false, false]);
	expect(probe.registrationsAfterStop).toEqual([await probe.sourceRoot]);
}

async function removesTheContainersOfEveryRepStillRunning(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	let running: readonly string[] = ["the stop never ran"];

	await Promise.allSettled([
		harness.run({ pipeline: SERVED_CONFIRMATION_PIPELINE }, (dependencies) => ({
			...dependencies,
			runSetup: async (worktreePath) => {
				if (!basename(worktreePath).includes("-rep-")) {
					return;
				}

				await harness.stops[FIRST_STOP_REQUEST_INDEX]?.();
				running = harness.containers.runningServices();

				throw new Error("the stop killed this rep's command");
			},
		})),
	]);

	expect(running).toEqual([]);
}

async function recordsAnOperatorStopAndWritesNoGroupRecordOrReport(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const groupId = "pipeline-stopped-record";
	const paths = confirmationGroupPaths(harness.runsDirectory, groupId);

	const outcome = harness.run({ groupId }, (dependencies) => ({
		...dependencies,
		runSetup: async (worktreePath) => {
			if (!basename(worktreePath).includes("-rep-")) {
				return;
			}

			await harness.stops[FIRST_STOP_REQUEST_INDEX]?.();

			throw new Error("the stop killed this rep's command");
		},
	}));

	expect(outcome).rejects.toBeInstanceOf(GroupStoppedError);
	expect(await operatorStopped(paths)).toBe(true);
	expect(await Bun.file(paths.groupFile).exists()).toBe(false);
	expect(await Bun.file(paths.reportFile).exists()).toBe(false);
}

describe(runPipelineConfirmation.name, () => {
	describe("when a signal stops it", () => {
		it(
			"removes the temporary root when stopped during group setup",
			removesTheTemporaryRootWhenStoppedDuringGroupSetup,
		);
		it(
			"deletes every created rep worktree and prunes its Git registration",
			deletesEveryCreatedRepWorktreeAndPrunesItsGitRegistration,
		);
		it(
			"removes the containers of every rep still running",
			removesTheContainersOfEveryRepStillRunning,
		);
		it(
			"records an operator stop and writes no group record or report",
			recordsAnOperatorStopAndWritesNoGroupRecordOrReport,
		);
	});
});
