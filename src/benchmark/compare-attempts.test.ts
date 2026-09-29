import { afterEach, describe, expect, it } from "bun:test";
import { Glob } from "bun";
import { mkdtemp, readdir, rm, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { compareAttempts, extendComparison } from "./compare-attempts";
import {
	CASE_ID,
	RecordedArms,
	RUN,
	STAGE,
	groupIdFor,
	moreGroupIdFor,
} from "./compare-attempts-test-support";
import { listedComparisonDigests } from "./comparison-baseline-record";
import { parseComparisonReport } from "./comparison-record";
import { RefusedPreconditionError } from "./exit-codes";
import { failureOf } from "#cli/cli-test-support";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

async function temporaryDirectory(prefix: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), prefix));
	temporaryDirectories.push(directory);

	return directory;
}

async function recordedArms(): Promise<RecordedArms> {
	return RecordedArms.create(
		await temporaryDirectory("rehearse-compare-runs-"),
		await temporaryDirectory("rehearse-compare-scratch-"),
	);
}

async function refusalOf(attempt: Promise<unknown>): Promise<Error> {
	try {
		await attempt;
	} catch (error) {
		if (error instanceof RefusedPreconditionError) {
			return error;
		}
		throw error;
	}
	throw new Error("Expected the comparison to be refused");
}

async function approveAny(): Promise<void> {
	// Every stated cost is approved.
}

const SHARED = {
	"CLAUDE.md": "global instructions\n",
	"skills/review/SKILL.md": "review\n",
};

describe(compareAttempts.name, () => {
	describe("when arms A and B hold identical corpora", () => {
		it("refuses before running a baseline group", async () => {
			const arms = await recordedArms();
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm("candidate", SHARED);

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				"arms A and B hold identical corpora, so nothing is under test",
			);
			expect(arms.baselineRequests).toEqual([]);
		});
	});

	describe("when arms A and B differ in more than one corpus unit", () => {
		it("refuses and names every differing unit", async () => {
			const arms = await recordedArms();
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"agents/helper.md": "helper\n",
				"skills/build/SKILL.md": "build\n",
			});

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				"arms A and B differ in more than one corpus unit: agents/helper.md, skills/build/",
			);
			expect(arms.baselineRequests).toEqual([]);
		});
	});

	describe("when arms A and B differ in a unit that is not a skill", () => {
		it("refuses and points at a manifest-supplied control", async () => {
			const arms = await recordedArms();
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"CLAUDE.md": "revised global instructions\n",
			});

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				"the arms differ in CLAUDE.md, which is not a skill; supply the control through a comparison manifest",
			);
			expect(arms.baselineRequests).toEqual([]);
		});
	});

	describe("when arms A and B replayed different checkpoints", () => {
		it("refuses and names both checkpoints", async () => {
			const arms = await recordedArms();
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm(
				"candidate",
				{ ...SHARED, "skills/build/SKILL.md": "build\n" },
				{ run: RUN, stage: "review" },
			);

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				`arms A and B replayed different checkpoints: ${RUN} ${STAGE} and ${RUN} review`,
			);
			expect(arms.baselineRequests).toEqual([]);
		});
	});

	describe("when an arm records no checkpoint it replayed", () => {
		it("refuses and names the group", async () => {
			const arms = await recordedArms();
			const armA = await arms.recordUnplacedArmA(SHARED);
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"skills/build/SKILL.md": "build\n",
			});

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				`group ${armA} records no checkpoint it replayed`,
			);
		});
	});

	describe("when an arm records no corpus version", () => {
		it("refuses and names the group", async () => {
			const arms = await recordedArms();
			const armA = await arms.recordUnversionedArmA();
			const armB = await arms.recordArm("candidate", SHARED);

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(`group ${armA} records no corpus version`);
		});
	});

	describe("when an arm is not a stage group", () => {
		it("refuses and names the group and its mode", async () => {
			const arms = await recordedArms();
			const armA = await arms.recordPipelineArmA(SHARED);
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"skills/build/SKILL.md": "build\n",
			});

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				`group ${armA} is a pipeline group; only stage groups replay one checkpoint`,
			);
		});
	});

	describe("when an arm's group cannot be read", () => {
		it("refuses a group that is not recorded and names it", async () => {
			const arms = await recordedArms();
			const armB = await arms.recordArm("candidate", SHARED);

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA: "never-recorded", armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				"No recorded confirmation group never-recorded",
			);
		});

		it("refuses a group file this comparison cannot read and names the group", async () => {
			const arms = await recordedArms();
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm("candidate", SHARED);
			await arms.corruptGroup(armA);

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toStartWith(
				`group ${armA} is not a confirmation group record this comparison can read: `,
			);
		});

		it("refuses a group whose corpus version the store does not hold", async () => {
			const arms = await recordedArms();
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm("candidate", SHARED);
			await arms.useUnrecordedCorpusVersion(armA);

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				`group ${armA} ran corpus version ${"0".repeat(64)}, which cannot be read: No corpus version ${"0".repeat(64)} is recorded`,
			);
		});
	});

	describe("when arms A and B ran with different controlled inputs", () => {
		it("refuses and names the differing field before running a baseline group", async () => {
			const arms = await recordedArms();
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"skills/build/SKILL.md": "build\n",
			});
			await arms.useModel(armB, "haiku");

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				`case ${CASE_ID} arms baseline and candidate field inputs.model differs`,
			);
			expect(arms.baselineRequests).toEqual([]);
		});
	});

	describe("when the replayed stage reads nothing in the one differing skill", () => {
		it("refuses before running a baseline group, since all three arms would read the same files", async () => {
			const arms = await recordedArms();
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"skills/build/SKILL.md": "build\n",
			});

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				`stage ${STAGE} reads nothing in skills/build/, so arms A and B ran the same files and nothing is under test`,
			);
			expect(arms.baselineRequests).toEqual([]);
		});
	});

	describe("when the replayed run can no longer grade a baseline group as it graded arm A", () => {
		it.each([
			{
				name: "the run's pipeline no longer has the stage",
				stage: "nowhere",
				rubric: undefined,
				message: `the ${RUN} run's pipeline has no nowhere stage, so no rubric can grade a baseline group against arm A`,
			},
			{
				name: "the stage's rubric can no longer be read",
				stage: STAGE,
				rubric: "rubrics/missing.json",
				message:
					"the rubrics/missing.json rubric cannot be read, so a baseline group run now could not be compared with arm A: ",
			},
		])(
			"refuses before running a baseline group when $name",
			async ({ stage, rubric, message }) => {
				const arms = await recordedArms();
				const checkpoint = { run: RUN, stage };
				const armA = await arms.recordArm(
					"baseline",
					{ ...SHARED, "skills/build/SKILL.md": "build\n" },
					checkpoint,
				);
				const armB = await arms.recordArm(
					"candidate",
					{ ...SHARED, "skills/build/SKILL.md": "revised build\n" },
					checkpoint,
				);
				await arms.readInStage(armA, "skills/build/SKILL.md");
				await arms.readInStage(armB, "skills/build/SKILL.md");
				if (rubric !== undefined) {
					await arms.nameStageRubric(rubric);
				}

				const refusal = await refusalOf(
					compareAttempts(
						{ runsDirectory: arms.runsDirectory, armA, armB },
						{ runBaselineGroup: arms.runBaselineGroup },
					),
				);

				expect(refusal.message).toStartWith(message);
				expect(arms.baselineRequests).toEqual([]);
			},
		);
	});

	describe("when arms A and B differ in one skill", () => {
		it("runs the baseline group on arm A without that skill, with arm A's inputs, once the replayed stage loads it", async () => {
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

			await compareAttempts(
				{ runsDirectory: arms.runsDirectory, armA, armB },
				{ runBaselineGroup: arms.runBaselineGroup },
			);

			const corpusDirectory = arms.baselineCorpusDirectory();
			expect(arms.baselineRequests).toEqual([
				{
					run: RUN,
					stage: STAGE,
					corpusDirectory,
					reps: 2,
					model: "sonnet",
					effort: undefined,
					judgeModel: "opus",
					judgeEffort: undefined,
					sessionBudgetUsd: 5,
					role: "control",
					withoutStageSkill: true,
				},
			]);
			expect(dirname(corpusDirectory)).toBe(
				join(arms.runsDirectory, "baseline-corpora"),
			);
			const corpus = await Array.fromAsync(
				new Glob("**/*").scan({ cwd: corpusDirectory }),
			);
			expect(corpus.toSorted()).toEqual([
				"CLAUDE.md",
				"skills/review/SKILL.md",
			]);
			const review = Bun.file(join(corpusDirectory, "skills/review/SKILL.md"));
			expect(await review.text()).toBe("review\n");
		});

		it("writes the baseline corpus readable by its owner only, as the store keeps it", async () => {
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

			await compareAttempts(
				{ runsDirectory: arms.runsDirectory, armA, armB },
				{ runBaselineGroup: arms.runBaselineGroup },
			);

			const review = await stat(
				join(arms.baselineCorpusDirectory(), "skills/review/SKILL.md"),
			);
			expect(review.mode % 0o1000).toBe(0o600);
		});
	});

	describe("when the skill under test is only in arm B", () => {
		it("runs the baseline group on arm A's corpus unchanged and records that it did", async () => {
			const arms = await recordedArms();
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"skills/build/SKILL.md": "build\n",
			});
			await arms.readInStage(armB, "skills/build/SKILL.md");

			const { reportFile } = await compareAttempts(
				{ runsDirectory: arms.runsDirectory, armA, armB },
				{ runBaselineGroup: arms.runBaselineGroup },
			);

			const corpus = await Array.fromAsync(
				new Glob("**/*").scan({ cwd: arms.baselineCorpusDirectory() }),
			);
			expect(corpus.toSorted()).toEqual([
				"CLAUDE.md",
				"skills/review/SKILL.md",
			]);
			const derivation = z
				.object({ kind: z.string(), skillUnderTest: z.string() })
				.parse(
					await Bun.file(join(dirname(reportFile), "baseline.json")).json(),
				);
			expect(derivation).toEqual({
				kind: "armA",
				skillUnderTest: "skills/build/",
			});
		});
	});

	describe("when the baseline group has run", () => {
		it("leaves no comparison behind when the report refuses its arms", async () => {
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
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{
						runBaselineGroup: async (request) => {
							const control = await arms.runBaselineGroup(request);
							await arms.useModel(control, "haiku");

							return control;
						},
					},
				),
			);

			expect(failure.message).toContain("inputs.model differs");
			expect(
				await readdir(join(arms.runsDirectory, "comparisons")).catch(() => []),
			).toEqual([]);
		});

		it("writes the report of arm A against arm B with the derived baseline, and how it was derived", async () => {
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
				{ runsDirectory: arms.runsDirectory, armA, armB },
				{ runBaselineGroup: arms.runBaselineGroup },
			);

			const report = parseComparisonReport(await Bun.file(reportFile).text());
			expect(reportFile).toBe(
				join(
					arms.runsDirectory,
					"comparisons",
					report.manifest.sha256,
					"report.json",
				),
			);
			const manifest = z
				.object({
					cases: z.array(
						z.object({
							arms: z.object({
								baseline: z.string(),
								candidate: z.string(),
								control: z.string(),
							}),
						}),
					),
				})
				.parse(
					await Bun.file(
						join(
							arms.runsDirectory,
							"comparison-manifests",
							`${groupIdFor("control")}.json`,
						),
					).json(),
				);
			expect(manifest.cases.map(({ arms: roles }) => roles)).toEqual([
				{
					baseline: `../confirmations/${armA}/group.json`,
					candidate: `../confirmations/${armB}/group.json`,
					control: `../confirmations/${groupIdFor("control")}/group.json`,
				},
			]);
			const derivation: unknown = await Bun.file(
				join(dirname(reportFile), "baseline.json"),
			).json();
			expect(derivation).toEqual({
				schemaVersion: 3,
				kind: "derived",
				skillUnderTest: "skills/build/",
				arms: {
					baseline: [armA],
					candidate: [armB],
					control: [groupIdFor("control")],
				},
				controlCorpus: basename(arms.baselineCorpusDirectory()),
			});
		});
	});
});

/** Arms A and B at one checkpoint, differing in the stage's own skill. */
async function armsDifferingInOneSkill(): Promise<{
	readonly arms: RecordedArms;
	readonly armA: string;
	readonly armB: string;
}> {
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

	return { arms, armA, armB };
}

/** A comparison `compare attempts` saved, named by its manifest digest. */
async function savedComparison(): Promise<{
	readonly arms: RecordedArms;
	readonly comparison: string;
}> {
	const { arms, armA, armB } = await armsDifferingInOneSkill();
	const { reportFile } = await compareAttempts(
		{ runsDirectory: arms.runsDirectory, armA, armB },
		{ runBaselineGroup: arms.runBaselineGroup },
	);

	return { arms, comparison: basename(dirname(reportFile)) };
}

describe(extendComparison.name, () => {
	it("writes a new comparison holding the added attempts in every arm, which names the comparison it extends", async () => {
		const { arms, comparison } = await savedComparison();

		const { reportFile } = await extendComparison(
			{ runsDirectory: arms.runsDirectory, comparison, attemptsPerArm: 2 },
			{ approve: approveAny, runArmGroup: arms.runMoreGroup },
		);

		const report = parseComparisonReport(await Bun.file(reportFile).text());
		expect(report.reps).toBe(4);
		expect(basename(dirname(reportFile))).not.toBe(comparison);
		const record: unknown = await Bun.file(
			join(dirname(reportFile), "baseline.json"),
		).json();
		expect(record).toEqual({
			schemaVersion: 3,
			kind: "derived",
			skillUnderTest: "skills/build/",
			arms: {
				baseline: [groupIdFor("baseline"), moreGroupIdFor("baseline")],
				candidate: [groupIdFor("candidate"), moreGroupIdFor("candidate")],
				control: [groupIdFor("control"), moreGroupIdFor("control")],
			},
			controlCorpus: basename(arms.baselineCorpusDirectory()),
			extends: comparison,
		});
	});

	it("runs each arm's added group on the corpus that arm ran, with arm A's inputs, leaving only the baseline without its stage skill", async () => {
		const { arms, comparison } = await savedComparison();

		await extendComparison(
			{ runsDirectory: arms.runsDirectory, comparison, attemptsPerArm: 3 },
			{ approve: approveAny, runArmGroup: arms.runMoreGroup },
		);

		const inputs = {
			run: RUN,
			stage: STAGE,
			reps: 3,
			model: "sonnet",
			effort: undefined,
			judgeModel: "opus",
			judgeEffort: undefined,
			sessionBudgetUsd: 5,
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

				return (await skill.exists()) ? skill.text() : undefined;
			}),
		);
		expect(corpora).toEqual(["build\n", "revised build\n", undefined]);
		expect(arms.moreRequests[2]?.corpusDirectory).toBe(
			arms.baselineCorpusDirectory(),
		);
	});

	it("states what the added attempts cost, at each arm's recorded cost per attempt, before running any group", async () => {
		const { arms, comparison } = await savedComparison();
		const stated: unknown[] = [];

		const declined = extendComparison(
			{ runsDirectory: arms.runsDirectory, comparison, attemptsPerArm: 2 },
			{
				approve: (cost) => {
					stated.push(cost);

					return Promise.reject(new Error("declined"));
				},
				runArmGroup: arms.runMoreGroup,
			},
		);

		const failure = await failureOf(declined);
		expect(failure.message).toBe("declined");
		expect(stated).toEqual([{ state: "available", attemptsPerArm: 2, usd: 9 }]);
		expect(arms.moreRequests).toEqual([]);
	});

	describe("refuses before running any group", () => {
		it("when no comparison was saved under that digest", async () => {
			const arms = await recordedArms();

			const refusal = await refusalOf(
				extendComparison(
					{
						runsDirectory: arms.runsDirectory,
						comparison: "0".repeat(64),
						attemptsPerArm: 2,
					},
					{ approve: approveAny, runArmGroup: arms.runMoreGroup },
				),
			);

			expect(refusal.message).toBe(`No saved comparison ${"0".repeat(64)}`);
			expect(arms.moreRequests).toEqual([]);
		});

		it("when the comparison was not made by compare attempts", async () => {
			const { arms, comparison } = await savedComparison();
			await unlink(
				join(arms.runsDirectory, "comparisons", comparison, "baseline.json"),
			);

			const refusal = await refusalOf(
				extendComparison(
					{ runsDirectory: arms.runsDirectory, comparison, attemptsPerArm: 2 },
					{ approve: approveAny, runArmGroup: arms.runMoreGroup },
				),
			);

			expect(refusal.message).toBe(
				`comparison ${comparison} was not made by compare attempts, so nothing records the checkpoint and corpora its arms would replay`,
			);
			expect(arms.moreRequests).toEqual([]);
		});

		it("when what the added attempts would cost cannot be stated", async () => {
			const { arms, armA, armB } = await armsDifferingInOneSkill();
			await arms.loseFirstAttemptMetrics(armA);
			const { reportFile } = await compareAttempts(
				{ runsDirectory: arms.runsDirectory, armA, armB },
				{ runBaselineGroup: arms.runBaselineGroup },
			);
			const comparison = basename(dirname(reportFile));

			const refusal = await refusalOf(
				extendComparison(
					{ runsDirectory: arms.runsDirectory, comparison, attemptsPerArm: 2 },
					{ approve: approveAny, runArmGroup: arms.runMoreGroup },
				),
			);

			expect(refusal.message).toBe(
				`what 2 more attempts per arm would cost cannot be stated: ${armA}-rep-1 lacks worker.costUsd`,
			);
			expect(arms.moreRequests).toEqual([]);
		});

		it("when the replayed run can no longer grade the added groups as it graded arm A", async () => {
			const { arms, comparison } = await savedComparison();
			await arms.nameStageRubric("rubrics/missing.json");

			const refusal = await refusalOf(
				extendComparison(
					{ runsDirectory: arms.runsDirectory, comparison, attemptsPerArm: 2 },
					{ approve: approveAny, runArmGroup: arms.runMoreGroup },
				),
			);

			expect(refusal.message).toStartWith(
				"the rubrics/missing.json rubric cannot be read",
			);
			expect(arms.moreRequests).toEqual([]);
		});
	});
});

describe(listedComparisonDigests.name, () => {
	it("lists an extension in place of the comparison it extends", async () => {
		const { arms, comparison } = await savedComparison();

		const { reportFile } = await extendComparison(
			{ runsDirectory: arms.runsDirectory, comparison, attemptsPerArm: 2 },
			{ approve: approveAny, runArmGroup: arms.runMoreGroup },
		);

		expect(await listedComparisonDigests(arms.runsDirectory)).toEqual([
			basename(dirname(reportFile)),
		]);
	});

	it("lists a saved comparison nothing extends", async () => {
		const { arms, comparison } = await savedComparison();

		expect(await listedComparisonDigests(arms.runsDirectory)).toEqual([
			comparison,
		]);
	});
});
