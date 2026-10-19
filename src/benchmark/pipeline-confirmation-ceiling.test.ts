import { describe, expect, it } from "bun:test";

import runPipelineConfirmation from "./pipeline-confirmation";
import PipelineCeilingFake from "./pipeline-confirmation-ceiling-test-fake";
import { readReps } from "./pipeline-confirmation-record-test-reader";
import { PipelineConfirmationHarness } from "./pipeline-confirmation-test-support";
import { TestResources } from "./test-support";

const THIRD_REP_RECORD_INDEX = 2;

const testResources = TestResources.forEachTest();

async function startsNoFurtherSessionInAnyRepOnceTheRepsSpendReachesTheGroupCeiling(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const ceiling = new PipelineCeilingFake();

	const outcome = await harness.run(
		{ groupId: "pipeline-ceiling", spendCeilingUsd: 1 },
		ceiling.override,
	);
	const records = await readReps(outcome);

	expect(ceiling.started.toSorted()).toEqual([
		"1-discuss",
		"2-discuss",
		"3-discuss",
	]);
	const [, refused] = records[THIRD_REP_RECORD_INDEX]?.stages ?? [];
	expect(refused?.status).toBe("EXECUTION_FAILED");
	expect(
		refused !== undefined && "error" in refused ? refused.error : "",
	).toContain("spend ceiling of USD 3");
}

describe(runPipelineConfirmation.name, () => {
	describe("when the repetitions reach their shared spend ceiling", () => {
		it(
			"starts no further session in any rep once the reps' spend reaches the group ceiling",
			startsNoFurtherSessionInAnyRepOnceTheRepsSpendReachesTheGroupCeiling,
		);
	});
});
