import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import { compareAttempts } from "./compare-attempts";
import {
	RESOURCE_DRAIN_START_INDEX,
	SHARED,
	recordedArms,
	refusalOf,
	temporaryDirectories,
} from "./compare-attempts-test-fixture";
import { RUN, STAGE } from "./compare-attempts-test-support";

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(RESOURCE_DRAIN_START_INDEX)
			.map(async (directory) => {
				await rm(directory, { force: true, recursive: true });
			}),
	);
});
describe(compareAttempts.name, () => {
	describe("when arms A and B hold identical corpora", () => {
		it(
			"refuses before running a baseline group",
			refusesBeforeRunningABaselineGroup,
		);
	});

	describe("when arms A and B differ in more than one corpus unit", () => {
		it(
			"refuses and names every differing unit",
			refusesAndNamesEveryDifferingUnit,
		);
	});

	describe("when arms A and B differ in a unit that is not a skill", () => {
		it(
			"refuses and points at a manifest-supplied control",
			refusesAndPointsAtAManifestSuppliedControl,
		);
	});

	describe("when arms A and B replayed different checkpoints", () => {
		it("refuses and names both checkpoints", refusesAndNamesBothCheckpoints);
	});

	describe("when an arm records no checkpoint it replayed", () => {
		it("refuses and names the group", refusesAndNamesTheGroup);
	});

	describe("when an arm records no corpus version", () => {
		it("refuses and names the group", refusesAndNamesTheGroup2);
	});

	describe("when an arm is not a stage group", () => {
		it(
			"refuses and names the group and its mode",
			refusesAndNamesTheGroupAndItsMode,
		);
	});
});

async function refusesBeforeRunningABaselineGroup(): Promise<void> {
	const arms = await recordedArms();
	const armA = await arms.recordArm("baseline", SHARED);
	const armB = await arms.recordArm("candidate", SHARED);

	const refusal = await refusalOf(
		compareAttempts(
			{ armA, armB, runsDirectory: arms.runsDirectory },
			{ runBaselineGroup: arms.runBaselineGroup },
		),
	);

	expect(refusal.message).toBe(
		"arms A and B hold identical corpora, so nothing is under test",
	);
	expect(arms.baselineRequests).toEqual([]);
}

async function refusesAndNamesEveryDifferingUnit(): Promise<void> {
	const arms = await recordedArms();
	const armA = await arms.recordArm("baseline", SHARED);
	const armB = await arms.recordArm("candidate", {
		...SHARED,
		"agents/helper.md": "helper\n",
		"skills/build/SKILL.md": "build\n",
	});

	const refusal = await refusalOf(
		compareAttempts(
			{ armA, armB, runsDirectory: arms.runsDirectory },
			{ runBaselineGroup: arms.runBaselineGroup },
		),
	);

	expect(refusal.message).toBe(
		"arms A and B differ in more than one corpus unit: agents/helper.md, skills/build/",
	);
	expect(arms.baselineRequests).toEqual([]);
}

async function refusesAndPointsAtAManifestSuppliedControl(): Promise<void> {
	const arms = await recordedArms();
	const armA = await arms.recordArm("baseline", SHARED);
	const armB = await arms.recordArm("candidate", {
		...SHARED,
		"CLAUDE.md": "revised global instructions\n",
	});

	const refusal = await refusalOf(
		compareAttempts(
			{ armA, armB, runsDirectory: arms.runsDirectory },
			{ runBaselineGroup: arms.runBaselineGroup },
		),
	);

	expect(refusal.message).toBe(
		"the arms differ in CLAUDE.md, which is not a skill; supply the control through a comparison manifest",
	);
	expect(arms.baselineRequests).toEqual([]);
}

async function refusesAndNamesBothCheckpoints(): Promise<void> {
	const arms = await recordedArms();
	const armA = await arms.recordArm("baseline", SHARED);
	const armB = await arms.recordArm(
		"candidate",
		{ ...SHARED, "skills/build/SKILL.md": "build\n" },
		{ run: RUN, stage: "review" },
	);

	const refusal = await refusalOf(
		compareAttempts(
			{ armA, armB, runsDirectory: arms.runsDirectory },
			{ runBaselineGroup: arms.runBaselineGroup },
		),
	);

	expect(refusal.message).toBe(
		`arms A and B replayed different checkpoints: ${RUN} ${STAGE} and ${RUN} review`,
	);
	expect(arms.baselineRequests).toEqual([]);
}

async function refusesAndNamesTheGroup(): Promise<void> {
	const arms = await recordedArms();
	const armA = await arms.recordUnplacedArmA(SHARED);
	const armB = await arms.recordArm("candidate", {
		...SHARED,
		"skills/build/SKILL.md": "build\n",
	});

	const refusal = await refusalOf(
		compareAttempts(
			{ armA, armB, runsDirectory: arms.runsDirectory },
			{ runBaselineGroup: arms.runBaselineGroup },
		),
	);

	expect(refusal.message).toBe(
		`group ${armA} records no checkpoint it replayed`,
	);
}

async function refusesAndNamesTheGroup2(): Promise<void> {
	const arms = await recordedArms();
	const armA = await arms.recordUnversionedArmA();
	const armB = await arms.recordArm("candidate", SHARED);

	const refusal = await refusalOf(
		compareAttempts(
			{ armA, armB, runsDirectory: arms.runsDirectory },
			{ runBaselineGroup: arms.runBaselineGroup },
		),
	);

	expect(refusal.message).toBe(`group ${armA} records no corpus version`);
}

async function refusesAndNamesTheGroupAndItsMode(): Promise<void> {
	const arms = await recordedArms();
	const armA = await arms.recordPipelineArmA(SHARED);
	const armB = await arms.recordArm("candidate", {
		...SHARED,
		"skills/build/SKILL.md": "build\n",
	});

	const refusal = await refusalOf(
		compareAttempts(
			{ armA, armB, runsDirectory: arms.runsDirectory },
			{ runBaselineGroup: arms.runBaselineGroup },
		),
	);

	expect(refusal.message).toBe(
		`group ${armA} is a pipeline group; only stage groups replay one checkpoint`,
	);
}
