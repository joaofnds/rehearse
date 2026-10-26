import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import { compareAttempts } from "./compare-attempts";
import {
	corruptGroup,
	useModel,
	useUnrecordedCorpusVersion,
} from "./compare-attempts-evidence-test-fixtures";
import {
	RESOURCE_DRAIN_START_INDEX,
	SHA256_HEX_DIGITS,
	SHARED,
	armsDifferingInOneSkill,
	recordedArms,
	refusalOf,
	temporaryDirectories,
} from "./compare-attempts-test-fixture";
import { CASE_ID, RUN, STAGE } from "./compare-attempts-test-support";

interface StageRubricExample {
	readonly name: string;
	readonly message: string;
	readonly rubric: string | undefined;
	readonly stage: string;
}

const UNREADABLE_STAGE_RUBRICS: readonly StageRubricExample[] = [
	{
		message: `the ${RUN} run's pipeline has no nowhere stage, so no rubric can grade a baseline group against arm A`,
		name: "the run's pipeline no longer has the stage",
		rubric: undefined,
		stage: "nowhere",
	},
	{
		message:
			"the rubrics/missing.json rubric cannot be read, so a baseline group run now could not be compared with arm A: ",
		name: "the stage's rubric can no longer be read",
		rubric: "rubrics/missing.json",
		stage: STAGE,
	},
];

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
	describe("when an arm's group cannot be read", () => {
		it(
			"refuses a group that is not recorded and names it",
			refusesAGroupThatIsNotRecordedAndNamesIt,
		);

		it(
			"refuses a group file this comparison cannot read and names the group",
			refusesAGroupFileThisComparisonCannotReadAndNamesTheGroup,
		);

		it(
			"refuses a group whose corpus version the store does not hold",
			refusesAGroupWhoseCorpusVersionTheStoreDoesNotHold,
		);
	});

	describe("when arms A and B ran with different controlled inputs", () => {
		it(
			"refuses and names the differing field before running a baseline group",
			refusesAndNamesTheDifferingFieldBeforeRunningABaselineGroup,
		);
	});

	describe("when the replayed stage reads nothing in the one differing skill", () => {
		it(
			"refuses before running a baseline group, since all three arms would read the same files",
			refusesBeforeRunningABaselineGroupSinceAllThreeArmsWouldReadTheSameFiles,
		);
	});

	describe("when the replayed run can no longer grade a baseline group as it graded arm A", () => {
		it.each([...UNREADABLE_STAGE_RUBRICS])(
			"refuses before running a baseline group when $name",
			refusesUnreadableStageRubric,
		);

		it(
			"refuses before running a baseline group when the stage's rubric changed since arm A was recorded",
			refusesBeforeRunningABaselineGroupWhenTheStagesRubricChangedSinceArmAWasRecorded,
		);
	});
});

async function refusesAGroupThatIsNotRecordedAndNamesIt(): Promise<void> {
	const arms = await recordedArms();
	const armB = await arms.recordArm("candidate", SHARED);

	const refusal = await refusalOf(
		compareAttempts(
			{ armA: "never-recorded", armB, runsDirectory: arms.runsDirectory },
			{ runBaselineGroup: arms.runBaselineGroup },
		),
	);

	expect(refusal.message).toBe("No recorded confirmation group never-recorded");
}

async function refusesAGroupFileThisComparisonCannotReadAndNamesTheGroup(): Promise<void> {
	const arms = await recordedArms();
	const armA = await arms.recordArm("baseline", SHARED);
	const armB = await arms.recordArm("candidate", SHARED);
	await corruptGroup({ groupId: armA, runsDirectory: arms.runsDirectory });

	const refusal = await refusalOf(
		compareAttempts(
			{ armA, armB, runsDirectory: arms.runsDirectory },
			{ runBaselineGroup: arms.runBaselineGroup },
		),
	);

	expect(refusal.message).toStartWith(
		`group ${armA} is not a confirmation group record this comparison can read: `,
	);
}

async function refusesAGroupWhoseCorpusVersionTheStoreDoesNotHold(): Promise<void> {
	const arms = await recordedArms();
	const armA = await arms.recordArm("baseline", SHARED);
	const armB = await arms.recordArm("candidate", SHARED);
	await useUnrecordedCorpusVersion({
		groupId: armA,
		runsDirectory: arms.runsDirectory,
	});

	const refusal = await refusalOf(
		compareAttempts(
			{ armA, armB, runsDirectory: arms.runsDirectory },
			{ runBaselineGroup: arms.runBaselineGroup },
		),
	);

	expect(refusal.message).toBe(
		`group ${armA} ran corpus version ${"0".repeat(SHA256_HEX_DIGITS)}, which cannot be read: No corpus version ${"0".repeat(SHA256_HEX_DIGITS)} is recorded`,
	);
}

async function refusesAndNamesTheDifferingFieldBeforeRunningABaselineGroup(): Promise<void> {
	const arms = await recordedArms();
	const armA = await arms.recordArm("baseline", SHARED);
	const armB = await arms.recordArm("candidate", {
		...SHARED,
		"skills/build/SKILL.md": "build\n",
	});
	await useModel({
		groupId: armB,
		model: "haiku",
		runsDirectory: arms.runsDirectory,
	});

	const refusal = await refusalOf(
		compareAttempts(
			{ armA, armB, runsDirectory: arms.runsDirectory },
			{ runBaselineGroup: arms.runBaselineGroup },
		),
	);

	expect(refusal.message).toBe(
		`case ${CASE_ID} arms baseline and candidate field inputs.model differs`,
	);
	expect(arms.baselineRequests).toEqual([]);
}

async function refusesBeforeRunningABaselineGroupSinceAllThreeArmsWouldReadTheSameFiles(): Promise<void> {
	const arms = await recordedArms();
	const armA = await arms.recordArm("baseline", SHARED);
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
		`stage ${STAGE} reads nothing in skills/build/, so arms A and B ran the same files and nothing is under test`,
	);
	expect(arms.baselineRequests).toEqual([]);
}

async function refusesUnreadableStageRubric({
	stage,
	rubric,
	message,
}: StageRubricExample): Promise<void> {
	const { arms, armA, armB } = await armsDifferingInOneSkill({
		run: RUN,
		stage,
	});

	if (rubric !== undefined) {
		await arms.nameStageRubric(rubric);
	}

	const refusal = await refusalOf(
		compareAttempts(
			{ armA, armB, runsDirectory: arms.runsDirectory },
			{ runBaselineGroup: arms.runBaselineGroup },
		),
	);

	expect(refusal.message).toStartWith(message);

	expect(arms.baselineRequests).toEqual([]);
}

async function refusesBeforeRunningABaselineGroupWhenTheStagesRubricChangedSinceArmAWasRecorded(): Promise<void> {
	const { arms, armA, armB } = await armsDifferingInOneSkill();
	const rubric = await arms.editStageRubric();

	const refusal = await refusalOf(
		compareAttempts(
			{ armA, armB, runsDirectory: arms.runsDirectory },
			{ runBaselineGroup: arms.runBaselineGroup },
		),
	);

	expect(refusal.message).toBe(
		`the ${rubric} rubric changed since arm A was recorded, so a baseline group run now could not be compared with it`,
	);
	expect(arms.baselineRequests).toEqual([]);
}
