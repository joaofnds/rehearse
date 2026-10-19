import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { freezeRubric } from "#benchmark/compare-attempts-evidence-test-fixtures";
import {
	RUN,
	RecordedArms,
	STAGE,
	STAGE_RUBRIC,
} from "#benchmark/compare-attempts-test-support";
import { readLaunchRecord } from "#benchmark/launch-record";
import {
	LaunchFixture,
	launchedSchema,
	refusalSchema,
} from "#server/launch-http-test-fixture";

const launchFixture = new LaunchFixture();

const { temporaryDirectory, harness } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

const SHARED = {
	"CLAUDE.md": "global instructions\n",
	"skills/review/SKILL.md": "review\n",
};

async function recordedArms(runsDirectory: string): Promise<RecordedArms> {
	return await RecordedArms.create(
		runsDirectory,
		await temporaryDirectory("rehearse-launch-arms-"),
	);
}

describe("POST /api/launches", () => {
	it(
		"compares them already approved once the free checks pass",
		verifyComparesThemAlreadyApprovedOnceTheFreeChecksPass,
	);
	it(
		"refuses a skill the replayed stage never reads, before starting anything",
		verifyRefusesASkillTheReplayedStageNeverReadsBefore,
	);
	it(
		"refuses a stage rubric changed since arm A was recorded, before starting anything",
		verifyRefusesAStageRubricChangedSinceArmAWas,
	);
	it(
		"refuses a skill under test that is not the replayed stage's own, before starting anything",
		verifyRefusesASkillUnderTestThatIsNotThe,
	);
	it(
		"refuses arms the comparison would refuse before starting anything",
		verifyRefusesArmsTheComparisonWouldRefuseBeforeStartingAnything,
	);
	it(
		"refuses a group that is not recorded",
		verifyRefusesAGroupThatIsNotRecorded,
	);
	it(
		"refuses a group id that could name a path outside the records",
		verifyRefusesAGroupIdThatCouldNameAPath,
	);
});

async function verifyComparesThemAlreadyApprovedOnceTheFreeChecksPass(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	const arms = await recordedArms(runsDirectory);
	const armA = await arms.recordArm("baseline", {
		...SHARED,
		"skills/build/SKILL.md": "build\n",
	});
	const armB = await arms.recordArm("candidate", {
		...SHARED,
		"skills/build/SKILL.md": "revised build\n",
	});
	await Promise.all([
		arms.readInStage(armA, "skills/build/SKILL.md"),
		arms.readInStage(armB, "skills/build/SKILL.md"),
	]);

	const response = await post({ armA, armB, kind: "comparison" });
	const { id } = launchedSchema.parse(await response.json());

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
	expect(launcher.launches.map(({ argv }) => argv)).toEqual([
		[
			"compare",
			"attempts",
			"--arm-a",
			armA,
			"--arm-b",
			armB,
			"--yes",
			"--approved-in-browser",
		],
	]);
	expect(await readLaunchRecord(runsDirectory, id)).toMatchObject({
		armA,
		armB,
		attempts: 2,
		kind: "comparison",
		run: RUN,
		stage: STAGE,
	});
}

async function verifyRefusesASkillTheReplayedStageNeverReadsBefore(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	const arms = await recordedArms(runsDirectory);
	const armA = await arms.recordArm("baseline", SHARED);
	const armB = await arms.recordArm("candidate", {
		...SHARED,
		"skills/build/SKILL.md": "build\n",
	});

	const response = await post({ armA, armB, kind: "comparison" });

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toBe(
		`stage ${STAGE} reads nothing in skills/build/, so arms A and B ran the same files and nothing is under test`,
	);
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesAStageRubricChangedSinceArmAWas(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	const arms = await recordedArms(runsDirectory);
	const armA = await arms.recordArm("baseline", {
		...SHARED,
		"skills/build/SKILL.md": "build\n",
	});
	const armB = await arms.recordArm("candidate", {
		...SHARED,
		"skills/build/SKILL.md": "revised build\n",
	});
	await Array.fromAsync([armA, armB], async (arm) => {
		await arms.readInStage(arm, "skills/build/SKILL.md");
		await freezeRubric({
			content: `${STAGE_RUBRIC}\n`,
			groupId: arm,
			runsDirectory: arms.runsDirectory,
		});
	});

	const response = await post({ armA, armB, kind: "comparison" });

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toBe(
		"the cases/audit-log/rubrics/build.json rubric changed since arm A was recorded, so a baseline group run now could not be compared with it",
	);
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesASkillUnderTestThatIsNotThe(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	const arms = await recordedArms(runsDirectory);
	const armA = await arms.recordArm("baseline", SHARED);
	const armB = await arms.recordArm("candidate", {
		...SHARED,
		"skills/review/SKILL.md": "revised review\n",
	});
	await arms.readInStage(armA, "skills/review/SKILL.md");
	await arms.readInStage(armB, "skills/review/SKILL.md");

	const response = await post({ armA, armB, kind: "comparison" });

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toBe(
		`skills/review/ is not the ${STAGE} stage's own skill, which is the only skill a baseline replay can run without`,
	);
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesArmsTheComparisonWouldRefuseBeforeStartingAnything(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	const arms = await recordedArms(runsDirectory);
	const armA = await arms.recordArm("baseline", SHARED);
	const armB = await arms.recordArm("candidate", SHARED);

	const response = await post({ armA, armB, kind: "comparison" });

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toBe(
		"arms A and B hold identical corpora, so nothing is under test",
	);
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesAGroupThatIsNotRecorded(): Promise<void> {
	const { launcher, post } = await harness();

	const response = await post({
		armA: "never-recorded",
		armB: "never-recorded-either",
		kind: "comparison",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	expect(refusalSchema.parse(await response.json()).error).toBe(
		"No recorded confirmation group never-recorded",
	);
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesAGroupIdThatCouldNameAPath(): Promise<void> {
	const { launcher, post } = await harness();

	const response = await post({
		armA: "../outside",
		armB: "never-recorded",
		kind: "comparison",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(launcher.launches).toEqual([]);
}
