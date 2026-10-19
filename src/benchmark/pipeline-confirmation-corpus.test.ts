import { describe, expect, it } from "bun:test";

import type { CorpusMeasurement } from "./corpus-measurement";
import { stageRubricSha256 } from "./judge-agreement";
import runPipelineConfirmation from "./pipeline-confirmation";
import {
	readCheckpoints,
	readGroup,
} from "./pipeline-confirmation-record-test-reader";
import {
	CONFIRMATION_PIPELINE,
	CONFIRMATION_STAGE_RUBRIC,
	PipelineConfirmationHarness,
} from "./pipeline-confirmation-test-support";
import PipelineTranscriptFixture from "./pipeline-confirmation-transcript-test-fixture";
import ReadManifestEntryBuilder from "./read-manifest-entry-test-builder";
import { TestResources } from "./test-support";

const MEASUREMENT_COUNT_INCREMENT = 1;

const SHA256_HEX_DIGITS = 64;

const EXPECTED_GROUP_CORPUS_MEASUREMENTS = 1;

const testResources = TestResources.forEachTest();

async function measuresTheCorpusOnceForTheGroupAndRecordsThatVersionOnTheGroupAndEveryRepStage(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	let measurements = 0;

	const outcome = await harness.run({}, (dependencies) => ({
		...dependencies,
		stageSession: {
			...dependencies.stageSession,
			measureCorpus: async () => {
				measurements += MEASUREMENT_COUNT_INCREMENT;

				return await Promise.resolve<CorpusMeasurement>({
					digest: String(measurements).repeat(SHA256_HEX_DIGITS),
					kind: "version",
				});
			},
		},
	}));
	const group = await readGroup(outcome);
	const recorded = await readCheckpoints(outcome);

	const groupVersion: CorpusMeasurement = {
		digest: "1".repeat(SHA256_HEX_DIGITS),
		kind: "version",
	};
	expect(measurements).toBe(EXPECTED_GROUP_CORPUS_MEASUREMENTS);
	expect(group.inputs.corpusVersion).toEqual(groupVersion);
	expect(recorded).toHaveLength(
		group.reps * CONFIRMATION_PIPELINE.stages.length,
	);
	expect(recorded.map(({ corpusVersion }) => corpusVersion)).toEqual(
		recorded.map(() => groupVersion),
	);
}

async function recordsOnEveryRepStageCheckpointAReadManifestOfItsJudgeRubricAndCorpusFiles(): Promise<void> {
	const expectedRecordedCount = 0;

	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run({});
	const recorded = await readCheckpoints(outcome);

	expect(recorded).not.toHaveLength(expectedRecordedCount);
	for (const checkpoint of recorded) {
		expect(checkpoint.readManifest).toContainEqual(
			new ReadManifestEntryBuilder({
				half: "rubric",
				path: `rubrics/${checkpoint.stage}.json`,
				role: "judge rubric",
				sha256: stageRubricSha256(CONFIRMATION_STAGE_RUBRIC),
			}).build(),
		);
		expect(
			checkpoint.readManifest
				?.filter(({ half }) => half === "corpus")
				.map(({ path, sha256 }) => ({ path, sha256 })),
		).toEqual([...checkpoint.corpusFiles]);
	}
}

async function marksAStageSkillTheRepSSessionWasObservedToRead(): Promise<void> {
	const expectedRecordedCount = 0;

	const harness = await PipelineConfirmationHarness.setup(testResources);
	const transcripts = await PipelineTranscriptFixture.setup(testResources);

	const outcome = await harness.run({}, transcripts.override);
	const recorded = await readCheckpoints(outcome);

	expect(recorded).not.toHaveLength(expectedRecordedCount);
	for (const checkpoint of recorded) {
		expect(
			checkpoint.readManifest?.find(
				({ path }) => path === `skills/${checkpoint.stage}/SKILL.md`,
			),
		).toMatchObject({
			evidence: "declared and observed",
			role: "stage skill",
		});
	}
}

describe(runPipelineConfirmation.name, () => {
	describe("when capturing the corpus for its repetitions", () => {
		it(
			"measures the corpus once for the group and records that version on the group and every rep stage",
			measuresTheCorpusOnceForTheGroupAndRecordsThatVersionOnTheGroupAndEveryRepStage,
		);
		it(
			"records on every rep stage checkpoint a read manifest of its judge rubric and corpus files",
			recordsOnEveryRepStageCheckpointAReadManifestOfItsJudgeRubricAndCorpusFiles,
		);
		it(
			"marks a stage skill the rep's session was observed to read",
			marksAStageSkillTheRepSSessionWasObservedToRead,
		);
	});
});
