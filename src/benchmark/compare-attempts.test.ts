import { afterEach, describe, expect, it } from "bun:test";
import { Glob } from "bun";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { compareAttempts } from "./compare-attempts";
import {
	CASE_ID,
	RecordedArms,
	RUN,
	STAGE,
	groupIdFor,
} from "./compare-attempts-test-support";
import { parseComparisonReport } from "./comparison-record";
import { RefusedPreconditionError } from "./exit-codes";

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

	describe("when arms A and B differ in one skill", () => {
		it("runs the baseline group on arm A without that skill, with arm A's inputs", async () => {
			const arms = await recordedArms();
			const armA = await arms.recordArm("baseline", {
				...SHARED,
				"skills/build/SKILL.md": "build\n",
			});
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"skills/build/SKILL.md": "revised build\n",
			});

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

	describe("when the baseline group has run", () => {
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
			const derivation: unknown = await Bun.file(
				join(dirname(reportFile), "baseline.json"),
			).json();
			expect(derivation).toEqual({
				schemaVersion: 1,
				kind: "derived",
				skillUnderTest: "skills/build/",
				arms: {
					baseline: armA,
					candidate: armB,
					control: groupIdFor("control"),
				},
				baselineCorpus: basename(arms.baselineCorpusDirectory()),
			});
		});
	});
});
