import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { JudgeAttempt } from "./judge-attempt";
import type { PendingStage } from "./run-abort";
import { writeStageJudgeFailure } from "./run-abort";
import StageScorecardBuilder from "./run-abort-scorecard-builder";
import StageJudgeInputBuilder from "./run-abort-stage-input-builder";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();
const CONTRACT_DIGEST_WIDTH = 64;
const RECORDED_JUDGE_CONTRACT = "a".repeat(CONTRACT_DIGEST_WIDTH);

async function testRetainsTheFrozenInputAndBothRejectedJudgeAttempts(): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-stage-failure-"));

	testResources.track(directory);

	const file = join(directory, "shape.json");
	const input = new StageJudgeInputBuilder({ stage: "shape" }).build();
	const attempts: readonly JudgeAttempt[] = [
		{
			costUsd: 0.1,
			error: "first validation error",
			outcome: "REJECTED",
			payload: { summary: "first invalid payload" },
		},
		{
			costUsd: 0.2,
			error: "second validation error",
			outcome: "REJECTED",
			payload: { summary: "second invalid payload" },
		},
	];
	const pending: PendingStage = {
		failure: {
			attempts,
			costUsd: 0.3,
			judgeContractSha256: RECORDED_JUDGE_CONTRACT,
			judgeProviderCalls: [{}, {}],
			prompt: "original prompt",
		},
		file,
		input,
		stage: "shape",
	};

	await writeStageJudgeFailure(pending, "second validation error");

	expect(JSON.parse(await Bun.file(file).text())).toEqual({
		attempts,
		costUsd: 0.3,
		error: "second validation error",
		input,
		judgeContractSha256: RECORDED_JUDGE_CONTRACT,
		judgeProviderCalls: [{}, {}],
		prompt: "original prompt",
		stage: "shape",
		status: "STAGE_JUDGE_FAILED",
	});
}

async function testCarriesTheStageSCapturedCorpusFiles(): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-stage-failure-"));

	testResources.track(directory);

	const file = join(directory, "build.json");
	const scorecard = new StageScorecardBuilder({
		requirementStatus: "FAIL",
	}).build();
	const corpusFiles = [{ path: "CLAUDE.md", sha256: "abc123" }];
	const pending: PendingStage = {
		corpusFiles,
		file,
		input: scorecard.input,
		scorecard,
		stage: "build",
	};

	await writeStageJudgeFailure(pending, "build stage graded F");

	expect(JSON.parse(await Bun.file(file).text())).toMatchObject({
		corpusFiles,
	});
}

async function testCarriesTheScorecardSGradeFieldsWhenANormalGradeFailureSuppliesOne(): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-stage-failure-"));

	testResources.track(directory);

	const file = join(directory, "discuss.json");
	const scorecard = {
		...new StageScorecardBuilder({ requirementStatus: "FAIL" }).build(),
		judgeContractSha256: RECORDED_JUDGE_CONTRACT,
	};
	const pending: PendingStage = {
		file,
		input: scorecard.input,
		scorecard,
		stage: "discuss",
	};

	await writeStageJudgeFailure(pending, "discuss stage graded F");

	expect(JSON.parse(await Bun.file(file).text())).toEqual({
		attempts: scorecard.attempts,
		costUsd: scorecard.costUsd,
		dimensions: scorecard.grade.dimensions,
		error: "discuss stage graded F",
		grade: { grade: scorecard.grade.grade, verdict: scorecard.grade.verdict },
		hardBlockers: scorecard.grade.hardBlockers,
		input: scorecard.input,
		judgeContractSha256: RECORDED_JUDGE_CONTRACT,
		requirements: scorecard.grade.requirements,
		stage: "discuss",
		status: "STAGE_JUDGE_FAILED",
		summary: scorecard.grade.summary,
	});
}

async function testCarriesTheModelJudgeModelEffortSettingsAndBudgetIntoTheFailedArtifact(): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-stage-failure-"));

	testResources.track(directory);

	const file = join(directory, "build.json");
	const scorecard = new StageScorecardBuilder({
		requirementStatus: "FAIL",
	}).build();
	const pending: PendingStage = {
		effort: "high",
		file,
		input: scorecard.input,
		judgeEffort: "medium",
		judgeModel: "claude-3-7-sonnet-20250219",
		model: "claude-3-5-sonnet-20241022",
		scorecard,
		sessionBudgetUsd: 15,
		stage: "build",
	};

	await writeStageJudgeFailure(pending, "build stage graded F");

	expect(JSON.parse(await Bun.file(file).text())).toMatchObject({
		effort: "high",
		judgeEffort: "medium",
		judgeModel: "claude-3-7-sonnet-20250219",
		model: "claude-3-5-sonnet-20241022",
		sessionBudgetUsd: 15,
	});
}

async function doesNotIdentifyAnUnattemptedJudge(): Promise<void> {
	const directory = await testResources.createControlDirectory();
	const file = join(directory, "shape.json");
	await writeStageJudgeFailure(
		{ file, input: new StageJudgeInputBuilder().build(), stage: "shape" },
		"stopped before Judge",
	);
	expect(JSON.parse(await Bun.file(file).text())).not.toHaveProperty(
		"judgeContractSha256",
	);
}

describe(writeStageJudgeFailure.name, () => {
	describe("when recording a failed stage", () => {
		it(
			"keeps a pre-Judge stop without an attempted contract",
			doesNotIdentifyAnUnattemptedJudge,
		);
		it(
			"retains the frozen input and both rejected Judge attempts",
			testRetainsTheFrozenInputAndBothRejectedJudgeAttempts,
		);
		it(
			"carries the stage's captured corpus files",
			testCarriesTheStageSCapturedCorpusFiles,
		);
		it(
			"carries the scorecard's grade fields when a normal grade failure supplies one",
			testCarriesTheScorecardSGradeFieldsWhenANormalGradeFailureSuppliesOne,
		);
		it(
			"carries the model, judge model, effort settings, and budget into the failed artifact",
			testCarriesTheModelJudgeModelEffortSettingsAndBudgetIntoTheFailedArtifact,
		);
	});
});
