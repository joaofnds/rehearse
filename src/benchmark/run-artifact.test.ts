import { describe, expect, it } from "bun:test";
import { join, relative } from "node:path";

import type { JudgeAttempt } from "./judge-attempt";
import { JudgeOutputValidationError } from "./judge-attempt";
import { loadPipeline } from "./pipeline";
import {
	buildFailedJudgeRunArtifact,
	buildRunArtifact,
	completeRunArtifact,
} from "./run-artifact";
import RunArtifactInputsBuilder from "./run-artifact-inputs-builder";
import RunArtifactBaseInputsBuilder from "./run-artifact-test-fixtures";
import {
	asConfigured,
	loadDefaultPipeline,
} from "./run-pipeline-test-fixtures";
import {
	AUDIT_LOG_PIPELINE_PATH,
	AUDIT_LOG_RUBRICS_PATH,
	PROJECT_ROOT,
	TEST_TARGET,
	TestResources,
	harnessResult,
} from "./test-support";

const testResources = TestResources.forEachTest();
async function buildsFailedArtifactFromRejectedAttempts(): Promise<void> {
	const pipeline = await loadDefaultPipeline();
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
	const failure = new JudgeOutputValidationError({
		attempts,
		costUsd: 0.3,
		message: "second validation error",
		prompt: "original prompt",
	});

	const artifact = buildFailedJudgeRunArtifact(
		new RunArtifactBaseInputsBuilder()
			.withPipeline(pipeline, AUDIT_LOG_PIPELINE_PATH)
			.build(),
		{ ceilingStop: undefined, failure },
	);

	expect(artifact).toMatchObject({
		baselineContext: [],
		changedPaths: ["src/example.ts"],
		checkIntegrity: harnessResult("PASS", "checks match"),
		diff: "the-diff",
		failure: "second validation error",
		judgeAttempts: attempts,
		judgeCostUsd: 0.3,
		judgePrompt: "original prompt",
		localChecks: harnessResult("PASS", "all green"),
		stageScorecards: [],
		status: "FAILED",
		workflow: [],
	});
	expect("grade" in artifact).toBe(false);
}

async function recordsSuccessfulAttemptsAndCost(): Promise<void> {
	const expectedJudgeCostUsd = 0.3;

	const pipeline = await loadDefaultPipeline();
	const attempts: readonly JudgeAttempt[] = [
		{
			costUsd: 0.1,
			error: "invalid evidence",
			outcome: "REJECTED",
			payload: { summary: "invalid" },
		},
		{
			costUsd: 0.2,
			outcome: "ACCEPTED",
			payload: { summary: "accepted" },
		},
	];
	const inputs = new RunArtifactInputsBuilder()
		.withPipeline(pipeline, AUDIT_LOG_PIPELINE_PATH)
		.build();

	const artifact = buildRunArtifact({
		...inputs,
		judge: { ...inputs.judge, attempts, costUsd: 0.3 },
	});

	expect(artifact.judgeAttempts).toBe(attempts);
	expect(artifact.judgeCostUsd).toBeCloseTo(expectedJudgeCostUsd);
}

async function recordsElapsedTimeAndProductOwnerCalls(): Promise<void> {
	const pipeline = await loadDefaultPipeline();
	const productOwnerCalls = [
		{
			metrics: {
				cacheReadTokens: 3,
				cacheWriteTokens: 4,
				costUsd: 0.5,
				inputTokens: 1,
				outputTokens: 2,
				turns: 1,
			},
		},
	];
	const inputs = new RunArtifactInputsBuilder()
		.withPipeline(pipeline, AUDIT_LOG_PIPELINE_PATH)
		.build();

	const artifact = buildRunArtifact({
		...inputs,
		elapsedMs: 90_000,
		productOwner: {
			providerCalls: productOwnerCalls,
			sessionId: "po",
			spentUsd: 0.5,
		},
	});

	expect(artifact).toMatchObject({
		elapsedMs: 90_000,
		productOwnerCostUsd: 0.5,
		productOwnerProviderCalls: productOwnerCalls,
	});
}

async function completesArtifactWithCalibration(): Promise<void> {
	const pipeline = await loadDefaultPipeline();

	const awaiting = buildRunArtifact(
		new RunArtifactInputsBuilder()
			.withPipeline(pipeline, AUDIT_LOG_PIPELINE_PATH)
			.build(),
	);
	const calibration: ReturnType<typeof completeRunArtifact>["calibration"] = {
		humanReview: {
			findings: [],
			summary: "The human agrees.",
			verdict: "ACCEPT",
		},
		instructionsChanged: false,
		rubricChanged: false,
		stageRubricsChanged: [],
	};
	const judgeAgreement: ReturnType<
		typeof completeRunArtifact
	>["judgeAgreement"] = {
		baselines: [],
		skippedCalibrations: 1,
	};

	const completed = completeRunArtifact(awaiting, calibration, judgeAgreement);

	expect(completed).toMatchObject({
		calibration,
		judgeAgreement,
		status: "COMPLETE",
	});
}

async function recordsConfiguredPipeline(): Promise<void> {
	const directory = await testResources.createControlDirectory();
	const absolute = join(directory, "custom.json");
	const pipelinePath = relative(PROJECT_ROOT, absolute);
	await Bun.write(
		absolute,
		JSON.stringify({
			stages: [
				{
					artifact: "backlog/docs/sketch.md",
					kind: "planning",
					name: "sketch",
					rubric: `${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
					skill: "discuss",
				},
				{
					kind: "delivery",
					name: "build",
					rubric: `${AUDIT_LOG_RUBRICS_PATH}/build.json`,
					skill: "build",
				},
			],
			statuses: ["To Do", "Done"],
			target: TEST_TARGET,
		}),
	);

	const pipeline = await loadPipeline(pipelinePath, AUDIT_LOG_RUBRICS_PATH);

	const artifact = buildRunArtifact(
		new RunArtifactInputsBuilder().withPipeline(pipeline, pipelinePath).build(),
	);

	expect(artifact.pipelinePath).toBe(pipelinePath);
	expect(artifact.pipeline.stages.map(({ name }) => name)).toEqual([
		"sketch",
		"build",
	]);
}

async function recordsDefaultPipeline(): Promise<void> {
	const pipeline = await loadDefaultPipeline();

	const artifact = buildRunArtifact(
		new RunArtifactInputsBuilder()
			.withPipeline(pipeline, AUDIT_LOG_PIPELINE_PATH)
			.build(),
	);

	expect(artifact.pipelinePath).toBe(AUDIT_LOG_PIPELINE_PATH);
	expect(artifact.pipeline.stages.map(({ name }) => name)).toEqual([
		"shape",
		"build",
	]);
}

async function canonicalizesPipelinePath(): Promise<void> {
	const pipeline = await loadDefaultPipeline();

	const recorded = [
		AUDIT_LOG_PIPELINE_PATH,
		join(PROJECT_ROOT, AUDIT_LOG_PIPELINE_PATH),
		`${AUDIT_LOG_RUBRICS_PATH}/../pipelines/default.json`,
	].map(
		(argument) =>
			buildRunArtifact(
				new RunArtifactInputsBuilder()
					.withPipeline(pipeline, asConfigured(argument))
					.build(),
			).pipelinePath,
	);

	expect(recorded).toEqual([
		AUDIT_LOG_PIPELINE_PATH,
		AUDIT_LOG_PIPELINE_PATH,
		AUDIT_LOG_PIPELINE_PATH,
	]);
}

describe(buildRunArtifact.name, () => {
	it(
		"builds a failed artifact from rejected final Judge attempts",
		buildsFailedArtifactFromRejectedAttempts,
	);
	it(
		"records successful final Judge attempts and aggregate cost",
		recordsSuccessfulAttemptsAndCost,
	);
	it(
		"records the run's elapsed time and the Product Owner's provider calls",
		recordsElapsedTimeAndProductOwnerCalls,
	);
	it(
		"completes the final artifact with calibration and Judge agreement",
		completesArtifactWithCalibration,
	);
	it(
		"records the pipeline it ran and the path it came from",
		recordsConfiguredPipeline,
	);
	it(
		"records the default pipeline when the run used it",
		recordsDefaultPipeline,
	);
	it(
		"records the same path whichever way the run named the pipeline",
		canonicalizesPipelinePath,
	);
});
