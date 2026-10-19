import { describe, expect, it } from "bun:test";
import { readdir, symlink } from "node:fs/promises";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { SymlinkedEntryError } from "./file-presence";
import runPipelineConfirmation from "./pipeline-confirmation";
import { PipelineConfirmationHarness } from "./pipeline-confirmation-test-support";
import { confirmationGroupPaths } from "./run-layout";
import { readShortIds } from "./short-id";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

async function refusesAForeignLayoutBeforeCreatingARepetition(): Promise<void> {
	const expectedSize = 0;

	const harness = await PipelineConfirmationHarness.setup(testResources);
	const outside = join(harness.runsDirectory, "foreign");
	await Bun.write(join(outside, "private.md"), "foreign bytes\n");
	await symlink(outside, join(harness.corpusRoot, "agents"));

	const failure = await failureOf(harness.run({}));

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
	expect(harness.retained.size).toBe(expectedSize);
	const group = confirmationGroupPaths(
		harness.runsDirectory,
		"pipeline-confirmation-1",
	);
	expect(await readdir(group.directory)).not.toContain("reps");
}

async function claimsNoShortIdWhenItsInputsAreRefused(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const outside = join(harness.runsDirectory, "foreign");
	await Bun.write(join(outside, "private.md"), "foreign bytes\n");
	await symlink(outside, join(harness.corpusRoot, "agents"));

	await failureOf(harness.run({ caseId: "audit-log-follow-up" }));

	expect(
		await readShortIds(harness.runsDirectory, "audit-log-follow-up"),
	).toEqual([]);
}

describe(runPipelineConfirmation.name, () => {
	describe("when the corpus layout reaches outside its source", () => {
		it(
			"refuses a foreign layout before creating a repetition",
			refusesAForeignLayoutBeforeCreatingARepetition,
		);
		it(
			"claims no short id when its inputs are refused",
			claimsNoShortIdWhenItsInputsAreRefused,
		);
	});
});
