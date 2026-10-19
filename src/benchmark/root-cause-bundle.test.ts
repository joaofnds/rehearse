import { describe, expect, it } from "bun:test";

import { operatorStopRecord } from "./operator-stop";
import {
	CORPUS_BODIES,
	RUN,
	runStoppedAtBuild,
	runWithOneGradedStage,
	stoppedStage,
	writeStage,
} from "./root-cause-analysis-test-support";
import type { BundleCorpusFile } from "./root-cause-bundle";
import { assembleRootCauseBundle } from "./root-cause-bundle";
import serializeRootCauseBundle from "./root-cause-bundle-format";
import RootCauseBundleWorkspace from "./root-cause-bundle-workspace-test-fixture";
import { benchmarkRunPaths } from "./run-layout";
import { TestResources } from "./test-support";

const SHA256_HEX_DIGITS = 64;
const workspace = new RootCauseBundleWorkspace(TestResources.forEachTest());

function sha256(text: string): string {
	return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

function corpusFile(
	path: keyof typeof CORPUS_BODIES,
	readBy: readonly string[],
): BundleCorpusFile {
	return {
		body: CORPUS_BODIES[path],
		path,
		readBy,
		sha256: sha256(CORPUS_BODIES[path]),
	};
}

const assembleRootCauseBundleRetainsTheHistoricalProviderBundleDigest =
	async (): Promise<void> => {
		const directory = await workspace.createDirectory();
		await runStoppedAtBuild(directory);

		const bundle = await assembleRootCauseBundle(directory, RUN);
		const text = serializeRootCauseBundle(bundle);

		expect(sha256(text)).toBe(
			"a732a6ed230d8d84111896f41dcb541266d14561b975395c40ff96b0e0222148",
		);
	};

const assembleRootCauseBundleHoldsEachStagesGradeTheOutcomeAndTheCorpusEachStageRead =
	async (): Promise<void> => {
		const directory = await workspace.createDirectory();
		await runStoppedAtBuild(directory);

		const bundle = await assembleRootCauseBundle(directory, RUN);

		expect(bundle).toEqual({
			caseId: "audit-log",
			corpusFiles: [
				corpusFile("CLAUDE.md", ["shape", "build"]),
				corpusFile("skills/shape/SKILL.md", ["shape"]),
				corpusFile("skills/build/SKILL.md", ["build"]),
			],
			declaredStages: ["shape", "build", "review"],
			outcome: {
				error: "build stage graded D; minimum grade is B",
				stage: "build",
				status: "STAGE_JUDGE_FAILED",
			},
			productBrief: "the brief",
			run: RUN,
			stages: [
				{
					changedPaths: ["src/shape.ts"],
					commitSubjects: ["feat: shape the audit log"],
					corpusReads: ["CLAUDE.md", "skills/shape/SKILL.md"],
					grade: { grade: "B", summary: "shape held", verdict: "CONTINUE" },
					stage: "shape",
					stopped: null,
				},
				{
					changedPaths: ["src/build.ts"],
					commitSubjects: ["feat: build the audit log"],
					corpusReads: ["CLAUDE.md", "skills/build/SKILL.md"],
					grade: { grade: "D", summary: "build missed", verdict: "STOP" },
					stage: "build",
					stopped: "build stage graded D; minimum grade is B",
				},
			],
			task: "add an audit log module",
		});
	};

const assembleRootCauseBundleTakesTheOutcomeOfACompletedRunFromItsFinalRecord =
	async (): Promise<void> => {
		const directory = await workspace.createDirectory();
		await runStoppedAtBuild(directory);
		await Bun.write(
			benchmarkRunPaths(directory, RUN).artifactFile,
			JSON.stringify({
				grade: { requirements: [], summary: "the task held", verdict: "PASS" },
				judgePrompt: "a prompt the bundle leaves out",
				status: "AWAITING_HUMAN_REVIEW",
			}),
		);

		const bundle = await assembleRootCauseBundle(directory, RUN);

		expect(bundle.outcome).toEqual({
			status: "AWAITING_HUMAN_REVIEW",
			summary: "the task held",
			verdict: "PASS",
		});
	};

const assembleRootCauseBundleTakesTheOutcomeOfARunTheOperatorStoppedFromItsStopRecord =
	async (): Promise<void> => {
		const directory = await workspace.createDirectory();
		await runWithOneGradedStage(directory);
		await Bun.write(
			benchmarkRunPaths(directory, RUN).operatorStopFile,
			operatorStopRecord("SIGINT"),
		);

		const bundle = await assembleRootCauseBundle(directory, RUN);

		expect(bundle.outcome).toEqual({ status: "OPERATOR_STOPPED" });
	};

const assembleRootCauseBundleTellsARunWhoseProcessDiedBeforeAnOutcomeFromAStoppedRun =
	async (): Promise<void> => {
		const directory = await workspace.createDirectory();
		await runWithOneGradedStage(directory);

		const bundle = await assembleRootCauseBundle(directory, RUN);

		expect(bundle.outcome).toEqual({ status: "NO_OUTCOME_RECORDED" });
	};

const assembleRootCauseBundleWhenTheSpendCeilingRefusedAStageBeforeItsSessionLeavesThatStageOutOf =
	async (): Promise<void> => {
		const directory = await workspace.createDirectory();
		await runWithOneGradedStage(directory);
		await Bun.write(
			benchmarkRunPaths(directory, RUN).stageFile("build"),
			JSON.stringify({
				ceilingStop: { ceilingUsd: 30, spentUsd: 30 },
				error: "spend ceiling reached",
				stage: "build",
				status: "STAGE_JUDGE_FAILED",
			}),
		);

		const bundle = await assembleRootCauseBundle(directory, RUN);

		expect(bundle.stages.map(({ stage }) => stage)).toEqual(["shape"]);
		expect(bundle.outcome).toMatchObject({ stage: "build" });
	};

const assembleRootCauseBundleWhenAStageReadACorpusFileItsCorpusVersionDoesNotHoldNamesThe =
	async (): Promise<void> => {
		const directory = await workspace.createDirectory();
		const corpusVersion = await runWithOneGradedStage(directory);
		await writeStage(
			directory,
			stoppedStage(
				"build",
				["CLAUDE.md", "output-styles/Explanatory.md"],
				corpusVersion,
			),
		);

		const bundle = await assembleRootCauseBundle(directory, RUN);

		const [, observedSecondStage] = bundle.stages;

		expect(observedSecondStage?.corpusReads).toEqual([
			"CLAUDE.md",
			"output-styles/Explanatory.md",
		]);
		expect(bundle.corpusFiles.map(({ path }) => path)).toEqual([
			"CLAUDE.md",
			"skills/shape/SKILL.md",
		]);
	};

const assembleRootCauseBundleWhenAStagesRecordPredatesTheReadManifestReadsTheCorpusFilesTheStageWas =
	async (): Promise<void> => {
		const directory = await workspace.createDirectory();
		await runWithOneGradedStage(directory);
		await writeStage(directory, {
			corpusFiles: [
				{ path: "CLAUDE.md", sha256: "e".repeat(SHA256_HEX_DIGITS) },
			],
			grade: { grade: "C", summary: "build missed", verdict: "STOP" },
			input: {
				changedPaths: [],
				commitSubjects: [],
				diff: "",
			},
			prompt: "",
			stage: "build",
		});

		const bundle = await assembleRootCauseBundle(directory, RUN);

		const [, observedSecondStage] = bundle.stages;

		expect(observedSecondStage).toMatchObject({
			corpusReads: ["CLAUDE.md"],
			stage: "build",
		});
		expect(bundle.corpusFiles.map(({ path }) => path)).toEqual([
			"CLAUDE.md",
			"skills/shape/SKILL.md",
		]);
	};

describe(assembleRootCauseBundle.name, () => {
	it(
		"retains the historical provider bundle digest",
		assembleRootCauseBundleRetainsTheHistoricalProviderBundleDigest,
	);

	it(
		"holds each stage's grade, the outcome and the corpus each stage read",
		assembleRootCauseBundleHoldsEachStagesGradeTheOutcomeAndTheCorpusEachStageRead,
	);

	it(
		"takes the outcome of a completed run from its final record",
		assembleRootCauseBundleTakesTheOutcomeOfACompletedRunFromItsFinalRecord,
	);

	it(
		"takes the outcome of a run the operator stopped from its stop record",
		assembleRootCauseBundleTakesTheOutcomeOfARunTheOperatorStoppedFromItsStopRecord,
	);

	it(
		"tells a run whose process died before an outcome from a stopped run",
		assembleRootCauseBundleTellsARunWhoseProcessDiedBeforeAnOutcomeFromAStoppedRun,
	);

	describe("when the spend ceiling refused a stage before its session", () => {
		it(
			"leaves that stage out of the stages that ran",
			assembleRootCauseBundleWhenTheSpendCeilingRefusedAStageBeforeItsSessionLeavesThatStageOutOf,
		);
	});

	describe("when a stage read a corpus file its corpus version does not hold", () => {
		it(
			"names the read and carries no body for it",
			assembleRootCauseBundleWhenAStageReadACorpusFileItsCorpusVersionDoesNotHoldNamesThe,
		);
	});

	describe("when a stage's record predates the read manifest", () => {
		it(
			"reads the corpus files the stage was given, without their bodies",
			assembleRootCauseBundleWhenAStagesRecordPredatesTheReadManifestReadsTheCorpusFilesTheStageWas,
		);
	});
});
