import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { basename, dirname } from "node:path";

import { compareAttempts } from "#benchmark/compare-attempts";
import { freezeRubric } from "#benchmark/compare-attempts-evidence-test-fixtures";
import {
	RUN,
	RecordedArms,
	STAGE,
	STAGE_RUBRIC_WITH_A_GRADED_EDIT,
	groupIdFor,
} from "#benchmark/compare-attempts-test-support";
import { readLaunchRecord } from "#benchmark/launch-record";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";
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

/** A comparison `compare attempts` saved, named by its manifest digest. */
async function savedComparison(runsDirectory: string): Promise<{
	readonly arms: RecordedArms;
	readonly comparison: string;
}> {
	const arms = await RecordedArms.create(
		runsDirectory,
		await temporaryDirectory("rehearse-launch-extend-"),
	);
	const shared = {
		"CLAUDE.md": "global instructions\n",
		"skills/review/SKILL.md": "review\n",
	};
	const armA = await arms.recordArm("baseline", {
		...shared,
		"skills/build/SKILL.md": "build\n",
	});
	const armB = await arms.recordArm("candidate", {
		...shared,
		"skills/build/SKILL.md": "revised build\n",
	});
	await arms.readInStage(armA, "skills/build/SKILL.md");
	await arms.readInStage(armB, "skills/build/SKILL.md");
	const { reportFile } = await compareAttempts(
		{ armA, armB, runsDirectory },
		{ runBaselineGroup: arms.runBaselineGroup },
	);

	return { arms, comparison: basename(dirname(reportFile)) };
}

describe("POST /api/launches", () => {
	it(
		"extends it already approved at the cost the dialog stated",
		verifyExtendsItAlreadyApprovedAtTheCostTheDialog,
	);
	it(
		"refuses when the cost differs from the one the dialog stated, before starting anything",
		verifyRefusesWhenTheCostDiffersFromTheOneThe,
	);
	it(
		"refuses a comparison the extension would refuse, before starting anything",
		verifyRefusesAComparisonTheExtensionWouldRefuseBeforeStarting,
	);
	it(
		"refuses a stage rubric changed since arm A was recorded, before starting anything",
		verifyRefusesAStageRubricChangedSinceArmAWasRecorded,
	);
	it(
		"refuses a comparison nothing saved",
		verifyRefusesAComparisonNothingSaved,
	);
	it(
		"refuses a comparison that could name a path outside the records",
		verifyRefusesAComparisonThatCouldNameAPathOutside,
	);
});

async function verifyExtendsItAlreadyApprovedAtTheCostTheDialog(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	const { comparison } = await savedComparison(runsDirectory);

	const response = await post({
		attempts: 2,
		comparison,
		kind: "extension",
		statedUsd: 9,
	});
	const { id } = launchedSchema.parse(await response.json());

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
	expect(launcher.launches.map(({ argv }) => argv)).toEqual([
		[
			"compare",
			"extend",
			"--comparison",
			comparison,
			"--attempts",
			"2",
			"--yes",
			"--approved-in-browser",
		],
	]);
	expect(await readLaunchRecord(runsDirectory, id)).toMatchObject({
		attempts: 2,
		comparison,
		kind: "extension",
		run: RUN,
		stage: STAGE,
		usd: 9,
	});
}

async function verifyRefusesWhenTheCostDiffersFromTheOneThe(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	const { comparison } = await savedComparison(runsDirectory);

	const response = await post({
		attempts: 2,
		comparison,
		kind: "extension",
		statedUsd: 4.5,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toBe(
		"Adding 2 attempts to each arm now costs about $9.00, not the $4.50 the dialog stated; reopen it to read the current cost",
	);
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesAComparisonTheExtensionWouldRefuseBeforeStarting(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	const { arms, comparison } = await savedComparison(runsDirectory);
	await arms.nameStageRubric("rubrics/missing.json");

	const response = await post({
		attempts: 2,
		comparison,
		kind: "extension",
		statedUsd: 9,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toStartWith(
		"the rubrics/missing.json rubric cannot be read",
	);
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesAStageRubricChangedSinceArmAWasRecorded(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	const { comparison } = await savedComparison(runsDirectory);
	await freezeRubric({
		content: STAGE_RUBRIC_WITH_A_GRADED_EDIT,
		groupId: groupIdFor("baseline"),
		runsDirectory,
	});

	const response = await post({
		attempts: 2,
		comparison,
		kind: "extension",
		statedUsd: 9,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toBe(
		"the cases/audit-log/rubrics/build.json rubric changed since arm A was recorded, so a baseline group run now could not be compared with it",
	);
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesAComparisonNothingSaved(): Promise<void> {
	const { launcher, post } = await harness();

	const response = await post({
		attempts: 2,
		comparison: "0".repeat(SHA256_HEX_DIGITS),
		kind: "extension",
		statedUsd: 9,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	expect(refusalSchema.parse(await response.json()).error).toBe(
		`No saved comparison ${"0".repeat(SHA256_HEX_DIGITS)}`,
	);
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesAComparisonThatCouldNameAPathOutside(): Promise<void> {
	const { launcher, post } = await harness();

	const response = await post({
		attempts: 2,
		comparison: "../outside",
		kind: "extension",
		statedUsd: 9,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(launcher.launches).toEqual([]);
}
