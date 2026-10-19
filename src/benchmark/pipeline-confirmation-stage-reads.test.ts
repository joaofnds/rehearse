import { describe, expect, it } from "bun:test";

import type { StageScorecard } from "#benchmark/contracts";

import { stageRubricSha256 } from "./judge-agreement";
import runPipelineConfirmation from "./pipeline-confirmation";
import { rejectedStageJudgment } from "./pipeline-confirmation-failure-test-fixtures";
import {
	readRejectedStageManifests,
	readStageManifests,
} from "./pipeline-confirmation-record-test-reader";
import {
	CONFIRMATION_STAGE_RUBRIC,
	PipelineConfirmationHarness,
	pipelineStageScorecard,
} from "./pipeline-confirmation-test-support";
import ReadManifestEntryBuilder from "./read-manifest-entry-test-builder";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

async function keepsOnTheStageFileOfARepItsJudgeStoppedTheReadManifestOfThatStage(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run({}, (dependencies) => ({
		...dependencies,
		runStageJudge: async (_execution, { input, source }) => {
			const scorecard = pipelineStageScorecard(input, source);

			return await Promise.resolve<StageScorecard>({
				...scorecard,
				grade: { ...scorecard.grade, grade: "F", verdict: "STOP" },
			});
		},
	}));
	const recorded = await readStageManifests({ outcome, stage: "discuss" });

	const rubricEntry = new ReadManifestEntryBuilder({
		half: "rubric",
		path: "rubrics/discuss.json",
		role: "judge rubric",
		sha256: stageRubricSha256(CONFIRMATION_STAGE_RUBRIC),
	}).build();
	expect(
		recorded.map((readManifest) =>
			readManifest.filter(({ half }) => half === "rubric"),
		),
	).toEqual([[rubricEntry], [rubricEntry], [rubricEntry]]);
}

async function keepsTheStageSReadsOnTheStageFileOfARepWhoseJudgeRejectedIt(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run({}, (dependencies) => ({
		...dependencies,
		runStageJudge: async () => await Promise.reject(rejectedStageJudgment()),
	}));
	const recorded = await readRejectedStageManifests({
		outcome,
		stage: "discuss",
	});

	const rubricEntry = new ReadManifestEntryBuilder({
		half: "rubric",
		path: "rubrics/discuss.json",
		role: "judge rubric",
		sha256: stageRubricSha256(CONFIRMATION_STAGE_RUBRIC),
	}).build();
	expect(
		recorded.map(({ readManifest }) =>
			readManifest.filter(({ half }) => half === "rubric"),
		),
	).toEqual([[rubricEntry], [rubricEntry], [rubricEntry]]);
}

describe(runPipelineConfirmation.name, () => {
	describe("when a stage judge stops or rejects the stage", () => {
		it(
			"keeps on the stage file of a rep its judge stopped the read manifest of that stage",
			keepsOnTheStageFileOfARepItsJudgeStoppedTheReadManifestOfThatStage,
		);
		it(
			"keeps the stage's reads on the stage file of a rep whose judge rejected it",
			keepsTheStageSReadsOnTheStageFileOfARepWhoseJudgeRejectedIt,
		);
	});
});
