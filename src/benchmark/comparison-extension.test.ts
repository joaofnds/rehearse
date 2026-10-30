import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { extendComparison } from "./compare-attempts";
import {
	CONTROL_ARM_REQUEST_POSITION,
	RESOURCE_DRAIN_START_INDEX,
	approveAny,
	savedComparison,
	temporaryDirectories,
} from "./compare-attempts-test-fixture";
import {
	RUN,
	STAGE,
	groupIdFor,
	moreGroupIdFor,
} from "./compare-attempts-test-support";
import { parseComparisonReport } from "./comparison-record";

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
	it(
		"writes a new comparison holding the added attempts in every arm, which names the comparison it extends",
		writesANewComparisonHoldingTheAddedAttemptsInEveryArmWhichNamesTheComparisonItExtends,
	);

	it(
		"runs each arm's added group on the corpus that arm ran, with arm A's inputs, leaving only the baseline without its stage skill",
		runsEachArmSAddedGroupOnTheCorpusThatArmRanWithArmASInputsLeavingOnlyTheBaselineWithoutItsStageSkill,
	);

	it(
		"states what the added attempts cost, at each arm's recorded cost per attempt, before running any group",
		statesWhatTheAddedAttemptsCostAtEachArmSRecordedCostPerAttemptBeforeRunningAnyGroup,
	);
});

async function writesANewComparisonHoldingTheAddedAttemptsInEveryArmWhichNamesTheComparisonItExtends(): Promise<void> {
	const expectedReps = 4;

	const { arms, comparison } = await savedComparison();

	const { reportFile } = await extendComparison(
		{ attemptsPerArm: 2, comparison, runsDirectory: arms.runsDirectory },
		{ approve: approveAny, runArmGroup: arms.runMoreGroup },
	);

	const report = parseComparisonReport(await Bun.file(reportFile).text());
	expect(report.reps).toBe(expectedReps);
	expect(basename(dirname(reportFile))).not.toBe(comparison);
	const record: unknown = await Bun.file(
		join(dirname(reportFile), "baseline.json"),
	).json();
	expect(record).toEqual({
		arms: {
			baseline: [groupIdFor("baseline"), moreGroupIdFor("baseline")],
			candidate: [groupIdFor("candidate"), moreGroupIdFor("candidate")],
			control: [groupIdFor("control"), moreGroupIdFor("control")],
		},
		controlCorpus: basename(arms.baselineCorpusDirectory()),
		extends: comparison,
		kind: "derived",
		schemaVersion: 3,
		skillUnderTest: "skills/build/",
	});
}

async function runsEachArmSAddedGroupOnTheCorpusThatArmRanWithArmASInputsLeavingOnlyTheBaselineWithoutItsStageSkill(): Promise<void> {
	const { arms, comparison } = await savedComparison();

	await extendComparison(
		{ attemptsPerArm: 3, comparison, runsDirectory: arms.runsDirectory },
		{ approve: approveAny, runArmGroup: arms.runMoreGroup },
	);

	const inputs = {
		effort: "medium" as const,
		judgeEffort: "medium" as const,
		judgeModel: "opus",
		model: "sonnet",
		reps: 3,
		run: RUN,
		sessionBudgetUsd: 5,
		stage: STAGE,
	};
	expect(
		arms.moreRequests.map(
			({ corpusDirectory: _corpus, ...request }) => request,
		),
	).toEqual([
		{ ...inputs, role: "baseline", withoutStageSkill: false },
		{ ...inputs, role: "candidate", withoutStageSkill: false },
		{ ...inputs, role: "control", withoutStageSkill: true },
	]);
	const corpora = await Promise.all(
		arms.moreRequests.map(async ({ corpusDirectory }) => {
			const skill = Bun.file(join(corpusDirectory, "skills/build/SKILL.md"));

			return (await skill.exists()) ? await skill.text() : undefined;
		}),
	);
	const observedThirdMoreRequest =
		arms.moreRequests[CONTROL_ARM_REQUEST_POSITION];

	expect(corpora).toEqual(["build\n", "revised build\n", undefined]);
	expect(observedThirdMoreRequest?.corpusDirectory).toBe(
		arms.baselineCorpusDirectory(),
	);
}

async function statesWhatTheAddedAttemptsCostAtEachArmSRecordedCostPerAttemptBeforeRunningAnyGroup(): Promise<void> {
	const { arms, comparison } = await savedComparison();
	const stated: unknown[] = [];

	const declined = extendComparison(
		{ attemptsPerArm: 2, comparison, runsDirectory: arms.runsDirectory },
		{
			approve: async (cost) => {
				stated.push(cost);

				await Promise.reject(new Error("declined"));
			},
			runArmGroup: arms.runMoreGroup,
		},
	);

	const failure = await failureOf(declined);
	expect(failure.message).toBe("declined");
	expect(stated).toEqual([{ attemptsPerArm: 2, state: "available", usd: 9 }]);
	expect(arms.moreRequests).toEqual([]);
}
