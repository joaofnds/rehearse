import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import {
	captureStageCorpus,
	captureStageCorpusWithoutSkill,
	snapshotStageCorpusWithoutSkill,
} from "./checkpoint";
import {
	corpusRoots,
	corpusSources,
	installAgent,
	installSkill,
} from "./checkpoint-corpus-test-fixture";
import { TestResources } from "./test-support";

const HOME_CORPUS_ROOT_INDEX = 1;

const TARGET_CORPUS_ROOT_INDEX = 0;

const testResources = TestResources.forEachTest();

async function testFreezesTheRestOfTheStageSCorpusForABaselineArm(): Promise<void> {
	const roots = await corpusRoots(testResources);
	await installAgent({
		agent: "reviewer",
		body: "reviewer agent",
		root: roots[HOME_CORPUS_ROOT_INDEX],
	});
	const destination = join(roots[TARGET_CORPUS_ROOT_INDEX], "snapshot");

	const frozen = await snapshotStageCorpusWithoutSkill(
		{ instructions: "instructions", skill: "discuss" },
		corpusSources(roots),
		destination,
	);

	expect(frozen.map(({ path }) => path)).toEqual([
		"CLAUDE.md",
		"agents/reviewer.md",
	]);

	expect(
		await captureStageCorpusWithoutSkill(
			"discuss",
			"instructions",
			corpusSources([destination]),
		),
	).toEqual(frozen);
}

async function testRefusesACorpusThatHoldsTheSkillSinceTheArmWouldReadIt(): Promise<void> {
	const roots = await corpusRoots(testResources);
	await installSkill({
		body: "discuss skill",
		root: roots[HOME_CORPUS_ROOT_INDEX],
		skill: "discuss",
	});

	const failure = await failureOf(
		captureStageCorpusWithoutSkill(
			"discuss",
			"instructions",
			corpusSources(roots),
		),
	);

	const [, observedSecondRoot] = roots;

	expect(failure.message).toBe(
		`The discuss skill is installed in ${observedSecondRoot}, but this stage runs without it`,
	);
}

describe(captureStageCorpus.name, () => {
	describe("when the stage runs without its own skill", () => {
		it(
			"freezes the rest of the stage's corpus for a baseline arm",
			testFreezesTheRestOfTheStageSCorpusForABaselineArm,
		);
		it(
			"refuses a corpus that holds the skill, since the arm would read it",
			testRefusesACorpusThatHoldsTheSkillSinceTheArmWouldReadIt,
		);
	});
});
