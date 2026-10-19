import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";

import {
	checkpointStageAt,
	checkpointStageNumber,
	formatShortId,
} from "./short-id";
import {
	CASE_ID,
	OUT_OF_RANGE_CHECKPOINT_STAGE_NUMBER,
	runsDirectory,
} from "./short-id-test-fixtures";

beforeEach(async () => {
	await mkdir(runsDirectory, { recursive: true });
});
afterEach(async () => {
	await rm(runsDirectory, { force: true, recursive: true });
});

const stages = ["discuss", "build"];
function spellsARunSNumberAfterItsCaseUnpadded(): void {
	expect(formatShortId({ caseId: CASE_ID, kind: "run", number: 12 })).toBe(
		"audit-log/r12",
	);
}

function numbersTheSetupCheckpoint0AndEachStageByItsPlaceInThePipeline(): void {
	const expectedSetupCheckpointNumber = 0;
	const expectedDiscussionCheckpointNumber = 1;
	const expectedBuildCheckpointNumber = 2;

	expect(
		["initial", "discuss", "build"].map((stage) =>
			checkpointStageNumber(stages, stage),
		),
	).toEqual([
		expectedSetupCheckpointNumber,
		expectedDiscussionCheckpointNumber,
		expectedBuildCheckpointNumber,
	]);
	expect(
		[
			{ checkpointNumber: 0 },
			{ checkpointNumber: 1 },
			{ checkpointNumber: 2 },
		].map(({ checkpointNumber }) =>
			checkpointStageAt(stages, checkpointNumber),
		),
	).toEqual(["initial", "discuss", "build"]);
}

function namesNoLabelForAStageOutsideThePipeline(): void {
	expect(checkpointStageNumber(stages, "review")).toBeUndefined();
	expect(
		checkpointStageAt(stages, OUT_OF_RANGE_CHECKPOINT_STAGE_NUMBER),
	).toBeUndefined();
}

describe(formatShortId.name, () => {
	it(
		"spells a run's number after its case, unpadded",
		spellsARunSNumberAfterItsCaseUnpadded,
	);
});

describe("checkpoint labels", () => {
	it(
		"numbers the setup checkpoint 0 and each stage by its place in the pipeline",
		numbersTheSetupCheckpoint0AndEachStageByItsPlaceInThePipeline,
	);

	it(
		"names no label for a stage outside the pipeline",
		namesNoLabelForAStageOutsideThePipeline,
	);
});
