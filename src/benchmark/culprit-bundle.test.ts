import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CORPUS_BODIES,
	RUN,
	runStoppedAtBuild,
	runWithOneGradedStep,
	stoppedStage,
	writeStage,
} from "./culprit-analysis-test-support";
import type { BundleCorpusFile } from "./culprit-bundle";
import { assembleCulpritBundle } from "./culprit-bundle";
import { operatorStopRecord } from "./operator-stop";
import { benchmarkRunPaths } from "./run-layout";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

async function runsDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-culprit-bundle-"));
	roots.push(root);

	return root;
}

function sha256(text: string): string {
	return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

function corpusFile(
	path: keyof typeof CORPUS_BODIES,
	readBy: readonly string[],
): BundleCorpusFile {
	return {
		path,
		sha256: sha256(CORPUS_BODIES[path]),
		body: CORPUS_BODIES[path],
		readBy,
	};
}

describe(assembleCulpritBundle.name, () => {
	it("holds each step's grade, the outcome and the corpus each step read", async () => {
		const directory = await runsDirectory();
		await runStoppedAtBuild(directory);

		const bundle = await assembleCulpritBundle(directory, RUN);

		expect(bundle).toEqual({
			run: RUN,
			caseId: "audit-log",
			task: "add an audit log module",
			productBrief: "the brief",
			declaredSteps: ["shape", "build", "review"],
			steps: [
				{
					step: "shape",
					grade: { grade: "B", verdict: "CONTINUE", summary: "shape held" },
					stopped: null,
					commitSubjects: ["feat: shape the audit log"],
					changedPaths: ["src/shape.ts"],
					corpusReads: ["CLAUDE.md", "skills/shape/SKILL.md"],
				},
				{
					step: "build",
					grade: { grade: "D", verdict: "STOP", summary: "build missed" },
					stopped: "build stage graded D; minimum grade is B",
					commitSubjects: ["feat: build the audit log"],
					changedPaths: ["src/build.ts"],
					corpusReads: ["CLAUDE.md", "skills/build/SKILL.md"],
				},
			],
			outcome: {
				status: "STAGE_JUDGE_FAILED",
				stage: "build",
				error: "build stage graded D; minimum grade is B",
			},
			corpusFiles: [
				corpusFile("CLAUDE.md", ["shape", "build"]),
				corpusFile("skills/shape/SKILL.md", ["shape"]),
				corpusFile("skills/build/SKILL.md", ["build"]),
			],
		});
	});

	it("takes the outcome of a completed run from its final record", async () => {
		const directory = await runsDirectory();
		await runStoppedAtBuild(directory);
		await Bun.write(
			benchmarkRunPaths(directory, RUN).artifactFile,
			JSON.stringify({
				status: "AWAITING_HUMAN_REVIEW",
				grade: { verdict: "PASS", summary: "the task held", requirements: [] },
				judgePrompt: "a prompt the bundle leaves out",
			}),
		);

		const bundle = await assembleCulpritBundle(directory, RUN);

		expect(bundle.outcome).toEqual({
			status: "AWAITING_HUMAN_REVIEW",
			verdict: "PASS",
			summary: "the task held",
		});
	});

	it("takes the outcome of a run the operator stopped from its stop record", async () => {
		const directory = await runsDirectory();
		await runWithOneGradedStep(directory);
		await Bun.write(
			benchmarkRunPaths(directory, RUN).operatorStopFile,
			operatorStopRecord("SIGINT"),
		);

		const bundle = await assembleCulpritBundle(directory, RUN);

		expect(bundle.outcome).toEqual({ status: "OPERATOR_STOPPED" });
	});

	it("tells a run whose process died before an outcome from a stopped run", async () => {
		const directory = await runsDirectory();
		await runWithOneGradedStep(directory);

		const bundle = await assembleCulpritBundle(directory, RUN);

		expect(bundle.outcome).toEqual({ status: "NO_OUTCOME_RECORDED" });
	});

	describe("when the spend ceiling refused a step before its session", () => {
		it("leaves that step out of the steps that ran", async () => {
			const directory = await runsDirectory();
			await runWithOneGradedStep(directory);
			await Bun.write(
				benchmarkRunPaths(directory, RUN).stageFile("build"),
				JSON.stringify({
					status: "STAGE_JUDGE_FAILED",
					stage: "build",
					error: "spend ceiling reached",
					ceilingStop: { ceilingUsd: 30, spentUsd: 30 },
				}),
			);

			const bundle = await assembleCulpritBundle(directory, RUN);

			expect(bundle.steps.map(({ step }) => step)).toEqual(["shape"]);
			expect(bundle.outcome).toMatchObject({ stage: "build" });
		});
	});

	describe("when a step read a corpus file its corpus version does not hold", () => {
		it("names the read and carries no body for it", async () => {
			const directory = await runsDirectory();
			const corpusVersion = await runWithOneGradedStep(directory);
			await writeStage(
				directory,
				stoppedStage(
					"build",
					["CLAUDE.md", "output-styles/Explanatory.md"],
					corpusVersion,
				),
			);

			const bundle = await assembleCulpritBundle(directory, RUN);

			expect(bundle.steps[1]?.corpusReads).toEqual([
				"CLAUDE.md",
				"output-styles/Explanatory.md",
			]);
			expect(bundle.corpusFiles.map(({ path }) => path)).toEqual([
				"CLAUDE.md",
				"skills/shape/SKILL.md",
			]);
		});
	});

	describe("when a step's record predates the read manifest", () => {
		it("reads the corpus files the step was given, without their bodies", async () => {
			const directory = await runsDirectory();
			await runWithOneGradedStep(directory);
			await writeStage(directory, {
				stage: "build",
				grade: { grade: "C", verdict: "STOP", summary: "build missed" },
				input: {
					commitSubjects: [],
					changedPaths: [],
					diff: "",
				},
				prompt: "",
				corpusFiles: [{ path: "CLAUDE.md", sha256: "e".repeat(64) }],
			});

			const bundle = await assembleCulpritBundle(directory, RUN);

			expect(bundle.steps[1]).toMatchObject({
				step: "build",
				corpusReads: ["CLAUDE.md"],
			});
			expect(bundle.corpusFiles.map(({ path }) => path)).toEqual([
				"CLAUDE.md",
				"skills/shape/SKILL.md",
			]);
		});
	});
});
