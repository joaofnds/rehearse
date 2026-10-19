import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readdir, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { Glob } from "bun";
import { z } from "zod";

import { compareAttempts } from "./compare-attempts";
import { useModel } from "./compare-attempts-evidence-test-fixtures";
import {
	OWNER_FILE_MODE,
	PERMISSION_MODE_RADIX,
	RESOURCE_DRAIN_START_INDEX,
	SAVED_COMPARISON_MANIFEST_SCHEMA,
	SHARED,
	recordedArms,
	refusalOf,
	temporaryDirectories,
} from "./compare-attempts-test-fixture";
import { RUN, STAGE, groupIdFor } from "./compare-attempts-test-support";
import { parseComparisonReport } from "./comparison-record";

interface StageReadComparison {
	readonly arms: Awaited<ReturnType<typeof recordedArms>>;
	readonly armA: string;
	readonly armB: string;
	readonly reportFile: string;
}

let baselineComparison: StageReadComparison | null = null;

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
	describe("when arms A and B differ in one skill", () => {
		beforeEach(preparesStageReadComparison);
		it(
			"runs the baseline group on arm A without that skill, with arm A's inputs, once the replayed stage loads it",
			runsTheBaselineGroupOnArmAWithoutThatSkillWithArmASInputsOnceTheReplayedStageLoadsIt,
		);

		it(
			"writes the baseline corpus readable by its owner only, as the store keeps it",
			writesTheBaselineCorpusReadableByItsOwnerOnlyAsTheStoreKeepsIt,
		);
	});

	describe("when the skill under test is only in arm B", () => {
		it(
			"runs the baseline group on arm A's corpus unchanged and records that it did",
			runsTheBaselineGroupOnArmASCorpusUnchangedAndRecordsThatItDid,
		);
	});

	describe("when the baseline group has run", () => {
		it(
			"leaves no comparison behind when the report refuses its arms",
			leavesNoComparisonBehindWhenTheReportRefusesItsArms,
		);

		describe(
			"after saving the stage-read comparison",
			registersSavedStageReadReports,
		);
	});
});

afterEach(() => {
	baselineComparison = null;
});

async function runsTheBaselineGroupOnArmAWithoutThatSkillWithArmASInputsOnceTheReplayedStageLoadsIt(): Promise<void> {
	if (baselineComparison === null) {
		throw new Error("the stage-read comparison was not prepared");
	}
	const { arms } = baselineComparison;

	const corpusDirectory = arms.baselineCorpusDirectory();
	expect(arms.baselineRequests).toEqual([
		{
			corpusDirectory,
			effort: undefined,
			judgeEffort: undefined,
			judgeModel: "opus",
			model: "sonnet",
			reps: 2,
			role: "control",
			run: RUN,
			sessionBudgetUsd: 5,
			stage: STAGE,
			withoutStageSkill: true,
		},
	]);
	expect(dirname(corpusDirectory)).toBe(
		join(arms.runsDirectory, "baseline-corpora"),
	);
	const corpus = await Array.fromAsync(
		new Glob("**/*").scan({ cwd: corpusDirectory }),
	);
	expect(corpus.toSorted()).toEqual(["CLAUDE.md", "skills/review/SKILL.md"]);
	const review = Bun.file(join(corpusDirectory, "skills/review/SKILL.md"));
	expect(await review.text()).toBe("review\n");
}

async function writesTheBaselineCorpusReadableByItsOwnerOnlyAsTheStoreKeepsIt(): Promise<void> {
	if (baselineComparison === null) {
		throw new Error("the stage-read comparison was not prepared");
	}
	const { arms } = baselineComparison;

	const review = await stat(
		join(arms.baselineCorpusDirectory(), "skills/review/SKILL.md"),
	);
	expect(review.mode % PERMISSION_MODE_RADIX).toBe(OWNER_FILE_MODE);
}

async function runsTheBaselineGroupOnArmASCorpusUnchangedAndRecordsThatItDid(): Promise<void> {
	const arms = await recordedArms();
	const armA = await arms.recordArm("baseline", SHARED);
	const armB = await arms.recordArm("candidate", {
		...SHARED,
		"skills/build/SKILL.md": "build\n",
	});
	await arms.readInStage(armB, "skills/build/SKILL.md");

	const { reportFile } = await compareAttempts(
		{ armA, armB, runsDirectory: arms.runsDirectory },
		{ runBaselineGroup: arms.runBaselineGroup },
	);

	const corpus = await Array.fromAsync(
		new Glob("**/*").scan({ cwd: arms.baselineCorpusDirectory() }),
	);
	expect(corpus.toSorted()).toEqual(["CLAUDE.md", "skills/review/SKILL.md"]);
	const recordData: unknown = await Bun.file(
		join(dirname(reportFile), "baseline.json"),
	).json();
	const derivation = z
		.object({ kind: z.string(), skillUnderTest: z.string() })
		.parse(recordData);
	expect(derivation).toEqual({
		kind: "armA",
		skillUnderTest: "skills/build/",
	});
}

async function leavesNoComparisonBehindWhenTheReportRefusesItsArms(): Promise<void> {
	const arms = await recordedArms();
	const armA = await arms.recordArm("baseline", {
		...SHARED,
		"skills/build/SKILL.md": "build\n",
	});
	const armB = await arms.recordArm("candidate", {
		...SHARED,
		"skills/build/SKILL.md": "revised build\n",
	});
	await arms.readInStage(armA, "skills/build/SKILL.md");
	await arms.readInStage(armB, "skills/build/SKILL.md");

	const failure = await refusalOf(
		compareAttempts(
			{ armA, armB, runsDirectory: arms.runsDirectory },
			{
				runBaselineGroup: async (request) => {
					const control = await arms.runBaselineGroup(request);
					await useModel({
						groupId: control,
						model: "haiku",
						runsDirectory: arms.runsDirectory,
					});

					return control;
				},
			},
		),
	);

	expect(failure.message).toContain("inputs.model differs");
	expect(
		await readdir(join(arms.runsDirectory, "comparisons")).catch(() => []),
	).toEqual([]);
}

async function writesTheReportOfArmAAgainstArmBWithTheDerivedBaselineAndHowItWasDerived(): Promise<void> {
	if (baselineComparison === null) {
		throw new Error("the stage-read comparison was not prepared");
	}
	const { arms, reportFile } = baselineComparison;

	const report = parseComparisonReport(await Bun.file(reportFile).text());

	expect(reportFile).toBe(
		join(
			arms.runsDirectory,
			"comparisons",
			report.manifest.sha256,
			"report.json",
		),
	);
}

async function namesTheThreeSavedArmGroups(): Promise<void> {
	if (baselineComparison === null) {
		throw new Error("the stage-read comparison was not prepared");
	}
	const { arms, armA, armB } = baselineComparison;

	const recordData: unknown = await Bun.file(
		join(
			arms.runsDirectory,
			"comparison-manifests",
			`${groupIdFor("control")}.json`,
		),
	).json();

	const manifest = SAVED_COMPARISON_MANIFEST_SCHEMA.parse(recordData);

	expect(manifest.cases.map(({ arms: roles }) => roles)).toEqual([
		{
			baseline: `../confirmations/${armA}/group.json`,
			candidate: `../confirmations/${armB}/group.json`,
			control: `../confirmations/${groupIdFor("control")}/group.json`,
		},
	]);
}

async function recordsHowTheBaselineCorpusWasDerived(): Promise<void> {
	if (baselineComparison === null) {
		throw new Error("the stage-read comparison was not prepared");
	}
	const { arms, armA, armB, reportFile } = baselineComparison;

	const derivation: unknown = await Bun.file(
		join(dirname(reportFile), "baseline.json"),
	).json();

	expect(derivation).toEqual({
		arms: {
			baseline: [armA],
			candidate: [armB],
			control: [groupIdFor("control")],
		},
		controlCorpus: basename(arms.baselineCorpusDirectory()),
		kind: "derived",
		schemaVersion: 3,
		skillUnderTest: "skills/build/",
	});
}

async function preparesStageReadComparison(): Promise<void> {
	const arms = await recordedArms();

	const armA = await arms.recordArm("baseline", {
		...SHARED,
		"skills/build/SKILL.md": "build\n",
	});

	const armB = await arms.recordArm("candidate", {
		...SHARED,
		"skills/build/SKILL.md": "revised build\n",
	});

	await arms.readInStage(armA, "skills/build/SKILL.md");

	await arms.readInStage(armB, "skills/build/SKILL.md");

	const { reportFile } = await compareAttempts(
		{ armA, armB, runsDirectory: arms.runsDirectory },
		{ runBaselineGroup: arms.runBaselineGroup },
	);
	baselineComparison = { armA, armB, arms, reportFile };
}

function registersSavedStageReadReports(): void {
	beforeEach(preparesStageReadComparison);
	it(
		"writes the report at its recorded manifest digest",
		writesTheReportOfArmAAgainstArmBWithTheDerivedBaselineAndHowItWasDerived,
	);
	it(
		"names the three saved arm groups in its manifest",
		namesTheThreeSavedArmGroups,
	);
	it(
		"records how its baseline corpus was derived",
		recordsHowTheBaselineCorpusWasDerived,
	);
}
