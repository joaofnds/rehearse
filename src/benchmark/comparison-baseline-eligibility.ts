import { createHash } from "node:crypto";

import type { BaselineCorpus } from "./baseline-corpus";
import { deriveBaselineCorpus } from "./baseline-corpus";
import { executedCorpusFiles } from "./comparison-arm-projection";
import type { Checkpoint, RecordedArm } from "./comparison-attempt-contract";
import { RefusedPreconditionError } from "./exit-codes";
import { loadRunManifest } from "./manifest";
import type { StageDefinition } from "./pipeline";
import { benchmarkRunPaths } from "./run-layout";
import { loadStageRubric } from "./stage-rubric";

const CORPUS_ROOT_AND_STAGE_SEGMENT_COUNT = 2;

const SINGLE_ITEM_COUNT = 1;

function describeCheckpoint({ run, stage }: Checkpoint): string {
	return `${run} ${stage}`;
}

function stageReadPaths({ group }: RecordedArm): readonly string[] {
	return executedCorpusFiles(group).map(({ path }) => {
		const segments = path.replaceAll("\\", "/").split("/");

		return segments
			.slice(
				segments.lastIndexOf("corpus") + CORPUS_ROOT_AND_STAGE_SEGMENT_COUNT,
			)
			.join("/");
	});
}

function assertStageReadsSkillUnderTest(
	armA: RecordedArm,
	armB: RecordedArm,
	skillUnderTest: string,
): void {
	const reads = [armA, armB].some((arm) =>
		stageReadPaths(arm).some((path) => path.startsWith(skillUnderTest)),
	);
	if (!reads) {
		throw new RefusedPreconditionError(
			`stage ${armA.checkpoint.stage} reads nothing in ${skillUnderTest}, so arms A and B ran the same files and nothing is under test`,
		);
	}
}

async function assertBaselineGradesOnArmARubric(
	runsDirectory: string,
	armA: RecordedArm,
	skillUnderTest: string,
): Promise<void> {
	const { run, stage: stageName } = armA.checkpoint;
	const manifest = await loadRunManifest(
		benchmarkRunPaths(runsDirectory, run).manifestFile,
	);
	const stage = manifest.pipeline.stages.find(({ name }) => name === stageName);
	if (stage === undefined) {
		throw new RefusedPreconditionError(
			`the ${run} run's pipeline has no ${stageName} stage, so no rubric can grade a baseline group against arm A`,
		);
	}
	if (skillUnderTest !== `skills/${stage.skill}/`) {
		throw new RefusedPreconditionError(
			`${skillUnderTest} is not the ${stage.name} stage's own skill, which is the only skill a baseline replay can run without`,
		);
	}

	const content = await readBaselineRubric(stage);
	if (
		createHash("sha256").update(content).digest("hex") !==
		frozenRubricSha256(armA)
	) {
		throw new RefusedPreconditionError(
			`the ${stage.rubric} rubric changed since arm A was recorded, so a baseline group run now could not be compared with it`,
		);
	}
}

function frozenRubricSha256(armA: RecordedArm): string {
	const rubric = armA.group.inputs.files.find(({ kind }) => kind === "rubric");
	if (rubric === undefined) {
		throw new RefusedPreconditionError(
			`group ${armA.group.groupId} froze no rubric`,
		);
	}

	return rubric.sha256;
}

async function readBaselineRubric(stage: StageDefinition): Promise<string> {
	try {
		const rubric = await loadStageRubric(stage);
		return rubric.content;
	} catch (error) {
		throw new RefusedPreconditionError(
			`the ${stage.rubric} rubric cannot be read, so a baseline group run now could not be compared with arm A: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function requiredComparisonBaseline(
	armA: ReadonlyMap<string, string>,
	armB: ReadonlyMap<string, string>,
): Exclude<BaselineCorpus, { readonly kind: "refused" }> {
	const baseline = deriveBaselineCorpus(armA, armB);
	if (baseline.kind === "refused") {
		const units =
			baseline.differingUnits.length > SINGLE_ITEM_COUNT
				? `: ${baseline.differingUnits.join(", ")}`
				: "";
		throw new RefusedPreconditionError(`${baseline.reason}${units}`);
	}
	return baseline;
}

export {
	assertBaselineGradesOnArmARubric,
	assertStageReadsSkillUnderTest,
	describeCheckpoint,
	requiredComparisonBaseline,
};
