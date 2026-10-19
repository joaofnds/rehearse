import { describe, expect, it } from "bun:test";
import { stat } from "node:fs/promises";
import { dirname } from "node:path";

import type { TargetCheck } from "./pipeline";
import runPipelineConfirmation from "./pipeline-confirmation";
import { PipelineConfirmationHarness } from "./pipeline-confirmation-test-support";
import { TestResources } from "./test-support";

interface PipelineObservations {
	observedChecks?: readonly TargetCheck[] | undefined;
	observedIntegrityFiles?: readonly string[] | undefined;
	worktreesDirectory?: string | undefined;
}

const testResources = TestResources.forEachTest();

async function removesItsWorktreesDirectoryWhenTheConfirmationBodyThrows(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const worktreesDirectoryCapture: PipelineObservations = {};
	const execution = harness.run(
		{ groupId: "pipeline-setup-failure" },
		(dependencies) => ({
			...dependencies,
			runSetup: (worktreePath) => {
				worktreesDirectoryCapture.worktreesDirectory = dirname(worktreePath);
				throw new Error("setup unavailable");
			},
		}),
	);

	expect(execution).rejects.toThrow("setup unavailable");
	expect(worktreesDirectoryCapture.worktreesDirectory).toBeDefined();
	expect(
		stat(worktreesDirectoryCapture.worktreesDirectory ?? ""),
	).rejects.toThrow();
}

describe(runPipelineConfirmation.name, () => {
	describe("when the confirmation body throws", () => {
		it(
			"removes its worktrees directory when the confirmation body throws",
			removesItsWorktreesDirectoryWhenTheConfirmationBodyThrows,
		);
	});
});
