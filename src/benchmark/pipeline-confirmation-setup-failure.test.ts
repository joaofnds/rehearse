import { describe, expect, it } from "bun:test";
import { stat } from "node:fs/promises";
import { dirname } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { readInFlightClaim } from "./in-flight-claim";
import type { InFlightClaim } from "./in-flight-claim";
import type { TargetCheck } from "./pipeline";
import runPipelineConfirmation from "./pipeline-confirmation";
import { PipelineConfirmationHarness } from "./pipeline-confirmation-test-support";
import { confirmationGroupPaths } from "./run-layout";
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

async function claimsTheGroupForThisProcessBeforeSettingUpARep(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const { directory } = confirmationGroupPaths(
		harness.runsDirectory,
		"pipeline-claimed",
	);
	const claims: Promise<InFlightClaim | undefined>[] = [];

	await failureOf(
		harness.run({ groupId: "pipeline-claimed" }, (dependencies) => ({
			...dependencies,
			runSetup: () => {
				claims.push(readInFlightClaim(directory));
				throw new Error("setup unavailable");
			},
		})),
	);

	expect(await Promise.all(claims)).toContainEqual({
		pid: process.pid,
		startedAt: expect.any(String),
	});
}

describe(runPipelineConfirmation.name, () => {
	it(
		"claims the group for this process before setting up a rep",
		claimsTheGroupForThisProcessBeforeSettingUpARep,
	);

	describe("when the confirmation body throws", () => {
		it(
			"removes its worktrees directory when the confirmation body throws",
			removesItsWorktreesDirectoryWhenTheConfirmationBodyThrows,
		);
	});
});
