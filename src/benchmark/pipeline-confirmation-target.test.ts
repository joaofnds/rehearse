import { describe, expect, it } from "bun:test";

import runPipelineConfirmation from "./pipeline-confirmation";
import { readFrozenPipeline } from "./pipeline-confirmation-record-test-reader";
import PipelineTargetProbe from "./pipeline-confirmation-target-test-probe";
import {
	CONFIRMATION_PIPELINE,
	PipelineConfirmationHarness,
} from "./pipeline-confirmation-test-support";
import { TestResources } from "./test-support";

const DEBUG_EXECUTION_EVENT_COUNT = 3;

const PREFIX_START_INDEX = 0;

const DECLARED_TARGET = {
	checks: [
		{ command: ["bun", "run", "first"] },
		{ command: ["bun", "run", "second"], env: { MODE: "strict" } },
	],
	integrityFiles: ["package.json"],
};

const testResources = TestResources.forEachTest();

async function usesThePipelineTargetBeforeTaskSetupOrProviderCalls(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const probe = new PipelineTargetProbe();
	const target = DECLARED_TARGET;

	await harness.run(
		{ pipeline: { ...CONFIRMATION_PIPELINE, target } },
		probe.override,
	);

	const checksWithNoServices = target.checks.map((check) => ({
		env: {},
		...check,
	}));
	expect(probe.observedChecks).toEqual(checksWithNoServices);
	expect(probe.observedIntegrityFiles).toEqual(target.integrityFiles);
	expect(probe.treatmentCheckSets).toEqual([
		checksWithNoServices,
		checksWithNoServices,
		checksWithNoServices,
	]);
	expect(
		probe.events.slice(PREFIX_START_INDEX, DEBUG_EXECUTION_EVENT_COUNT),
	).toEqual(["baseline checks", "integrity baseline", "task setup"]);
	expect(probe.events.indexOf("provider call")).toBeGreaterThan(
		probe.events.indexOf("task setup"),
	);
}

async function stopsWhenAPipelineBaselineCheckFails(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const events: string[] = [];

	expect(
		harness.run({}, (dependencies) => ({
			...dependencies,
			runChecks: async () => {
				events.push("baseline checks");

				await Promise.reject(new Error("baseline failed"));
			},
			seedTaskBoard: async (...args) => {
				events.push("task setup");

				return await dependencies.seedTaskBoard(...args);
			},
			stageSession: {
				...dependencies.stageSession,
				runWorkflowStage: async (request) => {
					events.push("provider call");

					return await dependencies.stageSession.runWorkflowStage(request);
				},
			},
		})),
	).rejects.toThrow("baseline failed");
	expect(events).toEqual(["baseline checks"]);
}

async function runsTheTargetSSetupInEveryWorktreeBeforeItsChecks(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const setup = [{ command: ["bun", "install"] }];
	const pipeline = {
		...CONFIRMATION_PIPELINE,
		target: { ...CONFIRMATION_PIPELINE.target, setup },
	};
	const probe = new PipelineTargetProbe();

	await harness.run({ pipeline }, probe.setupOverride);

	expect(probe.setupDirectories.toSorted()).toEqual(probe.worktrees.toSorted());
	expect(
		probe.checkPreparation.map(({ targetDir }) => targetDir).toSorted(),
	).toEqual(probe.worktrees.toSorted());
	expect(
		probe.checkPreparation.every(({ setupComplete }) => setupComplete),
	).toBe(true);
}

describe(runPipelineConfirmation.name, () => {
	describe("when preparing the declared target", () => {
		it(
			"records the declared target in its frozen pipeline input",
			recordsTheDeclaredTargetInFrozenPipelineInput,
		);
		it(
			"uses the pipeline target before task setup or provider calls",
			usesThePipelineTargetBeforeTaskSetupOrProviderCalls,
		);
		it(
			"stops when a pipeline baseline check fails",
			stopsWhenAPipelineBaselineCheckFails,
		);
		it(
			"runs the target's setup in every worktree before its checks",
			runsTheTargetSSetupInEveryWorktreeBeforeItsChecks,
		);
	});
});

async function recordsTheDeclaredTargetInFrozenPipelineInput(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run({
		pipeline: { ...CONFIRMATION_PIPELINE, target: DECLARED_TARGET },
	});
	const frozenPipeline = await readFrozenPipeline(outcome);

	expect(frozenPipeline).toMatchObject({ target: DECLARED_TARGET });
}
