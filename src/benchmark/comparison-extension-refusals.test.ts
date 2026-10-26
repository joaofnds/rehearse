import { afterEach, describe, expect, it } from "bun:test";
import { rm, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { compareAttempts, extendComparison } from "./compare-attempts";
import { loseFirstAttemptMetrics } from "./compare-attempts-evidence-test-fixtures";
import {
	RESOURCE_DRAIN_START_INDEX,
	SHA256_HEX_DIGITS,
	approveAny,
	armsDifferingInOneSkill,
	recordedArms,
	refusalOf,
	savedComparison,
	temporaryDirectories,
} from "./compare-attempts-test-fixture";

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(RESOURCE_DRAIN_START_INDEX)
			.map(async (directory) => {
				await rm(directory, { force: true, recursive: true });
			}),
	);
});
describe(extendComparison.name, () => {
	describe("refuses before running any group", () => {
		it(
			"when no comparison was saved under that digest",
			whenNoComparisonWasSavedUnderThatDigest,
		);

		it(
			"when the comparison was not made by compare attempts",
			whenTheComparisonWasNotMadeByCompareAttempts,
		);

		it(
			"when one attempt per arm would make groups too small to confirm",
			whenOneAttemptPerArmWouldMakeGroupsTooSmallToConfirm,
		);

		it(
			"when what the added attempts would cost cannot be stated",
			whenWhatTheAddedAttemptsWouldCostCannotBeStated,
		);

		it(
			"when the replayed run can no longer grade the added groups as it graded arm A",
			whenTheReplayedRunCanNoLongerGradeTheAddedGroupsAsItGradedArmA,
		);

		it(
			"when the stage's rubric changed since arm A was recorded",
			whenTheStagesRubricChangedSinceArmAWasRecorded,
		);
	});
});

async function whenNoComparisonWasSavedUnderThatDigest(): Promise<void> {
	const arms = await recordedArms();

	const refusal = await refusalOf(
		extendComparison(
			{
				attemptsPerArm: 2,
				comparison: "0".repeat(SHA256_HEX_DIGITS),
				runsDirectory: arms.runsDirectory,
			},
			{ approve: approveAny, runArmGroup: arms.runMoreGroup },
		),
	);

	expect(refusal.message).toBe(
		`No saved comparison ${"0".repeat(SHA256_HEX_DIGITS)}`,
	);
	expect(arms.moreRequests).toEqual([]);
}

async function whenTheComparisonWasNotMadeByCompareAttempts(): Promise<void> {
	const { arms, comparison } = await savedComparison();
	await unlink(
		join(arms.runsDirectory, "comparisons", comparison, "baseline.json"),
	);

	const refusal = await refusalOf(
		extendComparison(
			{ attemptsPerArm: 2, comparison, runsDirectory: arms.runsDirectory },
			{ approve: approveAny, runArmGroup: arms.runMoreGroup },
		),
	);

	expect(refusal.message).toBe(
		`comparison ${comparison} was not made by compare attempts, so nothing records the checkpoint and corpora its arms would replay`,
	);
	expect(arms.moreRequests).toEqual([]);
}

async function whenOneAttemptPerArmWouldMakeGroupsTooSmallToConfirm(): Promise<void> {
	const { arms, comparison } = await savedComparison();
	const approvals: unknown[] = [];

	const refusal = await refusalOf(
		extendComparison(
			{ attemptsPerArm: 1, comparison, runsDirectory: arms.runsDirectory },
			{
				approve: async (cost) => {
					approvals.push(cost);
					await Promise.resolve();
				},
				runArmGroup: arms.runMoreGroup,
			},
		),
	);

	expect(refusal.message).toBe(
		"a confirmation group needs at least 2 attempts, so add at least 2 attempts per arm",
	);
	expect(approvals).toEqual([]);
}

async function whenWhatTheAddedAttemptsWouldCostCannotBeStated(): Promise<void> {
	const { arms, armA, armB } = await armsDifferingInOneSkill();
	await loseFirstAttemptMetrics({
		groupId: armA,
		runsDirectory: arms.runsDirectory,
	});
	const { reportFile } = await compareAttempts(
		{ armA, armB, runsDirectory: arms.runsDirectory },
		{ runBaselineGroup: arms.runBaselineGroup },
	);
	const comparison = basename(dirname(reportFile));

	const refusal = await refusalOf(
		extendComparison(
			{ attemptsPerArm: 2, comparison, runsDirectory: arms.runsDirectory },
			{ approve: approveAny, runArmGroup: arms.runMoreGroup },
		),
	);

	expect(refusal.message).toBe(
		`what 2 more attempts per arm would cost cannot be stated: ${armA}-rep-1 lacks worker.costUsd`,
	);
	expect(arms.moreRequests).toEqual([]);
}

async function whenTheReplayedRunCanNoLongerGradeTheAddedGroupsAsItGradedArmA(): Promise<void> {
	const { arms, comparison } = await savedComparison();
	await arms.nameStageRubric("rubrics/missing.json");

	const refusal = await refusalOf(
		extendComparison(
			{ attemptsPerArm: 2, comparison, runsDirectory: arms.runsDirectory },
			{ approve: approveAny, runArmGroup: arms.runMoreGroup },
		),
	);

	expect(refusal.message).toStartWith(
		"the rubrics/missing.json rubric cannot be read",
	);
	expect(arms.moreRequests).toEqual([]);
}

async function whenTheStagesRubricChangedSinceArmAWasRecorded(): Promise<void> {
	const { arms, comparison } = await savedComparison();
	const rubric = await arms.editStageRubric();

	const refusal = await refusalOf(
		extendComparison(
			{ attemptsPerArm: 2, comparison, runsDirectory: arms.runsDirectory },
			{ approve: approveAny, runArmGroup: arms.runMoreGroup },
		),
	);

	expect(refusal.message).toBe(
		`the ${rubric} rubric changed since arm A was recorded, so a baseline group run now could not be compared with it`,
	);
	expect(arms.moreRequests).toEqual([]);
}
