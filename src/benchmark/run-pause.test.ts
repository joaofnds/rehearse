import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { RunPausedError, runGradedStages } from "./run";
import {
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import { stageFixture } from "./run-stage-dependencies-test-fixture";

const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});

describe("runGradedStages pause", () => {
	describe("when a pause is requested during a stage", () => {
		it("ends after that stage's checkpoint and starts no further stage", async () => {
			const { dependencies, executed, context } = await stageFixture();

			const failure = await failureOf(
				runGradedStages(dependencies, {
					...context,
					pauseRequested: async () => await Promise.resolve(true),
				}),
			);

			expect(failure).toBeInstanceOf(RunPausedError);
			expect(failure).toMatchObject({ stage: "shape" });
			expect(executed).toEqual(["shape"]);
			const completedCheckpointExists = await Bun.file(
				join(context.checkpointDirectory("shape"), "checkpoint.json"),
			).exists();
			expect(completedCheckpointExists).toBe(true);
		});

		it("finishes the run when the request arrives during the last stage", async () => {
			const { dependencies, executed, context } = await stageFixture();
			const pauseAfter = new Set(["build"]);

			await runGradedStages(dependencies, {
				...context,
				pauseRequested: async () =>
					await Promise.resolve(
						executed.some((stage) => pauseAfter.has(stage)),
					),
			});

			expect(executed).toEqual(["shape", "build"]);
		});
	});
});
