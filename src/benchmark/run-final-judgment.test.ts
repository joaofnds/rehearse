import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import { ClaudeSessionError } from "./claude";
import {
	FINAL_JUDGE_CONTRACT_SHA256,
	citedFinalJudgeInputs,
	completeGrade,
	failedJudgeResponses,
	finalJudgeInputs,
	haltedRetryResponses,
	parsePaidFinalArtifact,
	refusedRetryResponses,
	rejectedJudgeResponses,
} from "./final-judge-record-test-fixtures";
import {
	JudgeExecutionError,
	JudgeOutputValidationError,
} from "./judge-attempt";
import { buildRunArtifact } from "./run-artifact";
import FinalJudgeFixture from "./run-final-judge-test-fixtures";
import { judgeRun, runFinalJudge } from "./run-final-judgment";
import { SpendCeilingReachedError, createSpendCeiling } from "./spend-ceiling";
import { TestResources, ampleSpendCeiling } from "./test-support";

const EXPECTED_REJECTED_JUDGE_CALLS = 2;
const EXPECTED_RETRY_BUDGET_USD = 0.15;
const EXPECTED_RETRY_JUDGE_COST_USD = 0.25;
const EXPECTED_STOP_SPEND_USD = 0.25;
const EXPECTED_RETRY_PROVIDER_CALLS = [
	{
		metrics: {
			cacheReadTokens: 3,
			cacheWriteTokens: 4,
			costUsd: 0.1,
			inputTokens: 1,
			outputTokens: 2,
			turns: 1,
		},
	},
	{
		metrics: {
			cacheReadTokens: 7,
			cacheWriteTokens: 8,
			costUsd: 0.15,
			inputTokens: 5,
			outputTokens: 6,
			turns: 2,
		},
	},
];
const INJECTED_QUESTION_EVENT_ELAPSED_MS = 6400;
const PROVIDER_TURN_ELAPSED_MS = 5000;
const testResources = TestResources.forEachTest();
async function recordsRejectedFinalPayloads(): Promise<void> {
	const fixture = await FinalJudgeFixture.create(testResources, {
		inputs: await citedFinalJudgeInputs(),
		responses: rejectedJudgeResponses(),
	});

	const result = runFinalJudge({
		artifactInputs: fixture.inputs,
		elapsedMs: () => INJECTED_QUESTION_EVENT_ELAPSED_MS,
		invoke: fixture.invoke,
		spendCeiling: ampleSpendCeiling(),
		writeFailedArtifact: fixture.abort.writeFailedArtifact,
	});

	expect(result).rejects.toBeInstanceOf(JudgeOutputValidationError);
	await Promise.allSettled([result]);
	const artifact: unknown = JSON.parse(
		fixture.persistence.files.get(fixture.artifactFile) ?? "",
	);
	expect(fixture.calls).toBe(EXPECTED_REJECTED_JUDGE_CALLS);
	expect(artifact).toMatchObject({
		elapsedMs: 6400,
		failure: "Judge cited unavailable evidence for tests: diff:src/missing.ts",
		judgeAttempts: [
			{ costUsd: 0.1, outcome: "REJECTED" },
			{ costUsd: 0.1, outcome: "REJECTED" },
		],
		judgeContractSha256: FINAL_JUDGE_CONTRACT_SHA256,
		judgeCostUsd: 0.2,
		stageScorecards: [],
		status: "FAILED",
		workflow: [],
	});
	expect(artifact).not.toHaveProperty("grade");
}
async function recordsRefusedRetrySpend(): Promise<void> {
	const fixture = await FinalJudgeFixture.create(testResources, {
		inputs: await finalJudgeInputs(),
		responses: refusedRetryResponses(),
	});

	const failure = await failureOf(
		runFinalJudge({
			artifactInputs: fixture.inputs,
			invoke: fixture.invoke,
			spendCeiling: createSpendCeiling({ ceilingUsd: 0.15 }),
			writeFailedArtifact: fixture.abort.writeFailedArtifact,
		}),
	);

	expect(failure).toBeInstanceOf(SpendCeilingReachedError);
	expect(
		JSON.parse(fixture.persistence.files.get(fixture.artifactFile) ?? "{}"),
	).toMatchObject({
		ceilingStop: { ceilingUsd: 0.15, spentUsd: 0.2 },
		judgeAttempts: [{ costUsd: 0.2, outcome: "REJECTED" }],
		judgeContractSha256: FINAL_JUDGE_CONTRACT_SHA256,
		judgeCostUsd: 0.2,
		status: "FAILED",
	});
}
async function keepsFailureWithBudgetLeft(): Promise<void> {
	const fixture = new FinalJudgeFixture({
		directory: "/runs",
		inputs: await finalJudgeInputs(),
		responses: failedJudgeResponses(),
	});

	const failure = await failureOf(
		runFinalJudge({
			artifactInputs: fixture.inputs,
			invoke: fixture.invoke,
			spendCeiling: createSpendCeiling({ ceilingUsd: 10 }),
			writeFailedArtifact: fixture.abort.writeFailedArtifact,
		}),
	);

	expect(failure).toBeInstanceOf(JudgeExecutionError);
	expect(fixture.persistence.files.has("/runs/run.json")).toBe(false);
}
async function recordsBudgetHaltedRetry(): Promise<void> {
	const fixture = await FinalJudgeFixture.create(testResources, {
		inputs: await finalJudgeInputs(),
		responses: haltedRetryResponses(),
	});

	const failure = await failureOf(
		runFinalJudge({
			artifactInputs: fixture.inputs,
			invoke: fixture.invoke,
			spendCeiling: createSpendCeiling({ ceilingUsd: 0.25 }),
			writeFailedArtifact: fixture.abort.writeFailedArtifact,
		}),
	);

	expect(failure).toBeInstanceOf(JudgeExecutionError);
	expect(failure.cause).toBeInstanceOf(ClaudeSessionError);
	expect(fixture.retryBudget).toBeCloseTo(EXPECTED_RETRY_BUDGET_USD);
	const artifact = parsePaidFinalArtifact(
		fixture.persistence.files.get(fixture.artifactFile) ?? "{}",
	);
	expect(artifact).toMatchObject({
		ceilingStop: { ceilingUsd: 0.25 },
		judgeAttempts: [{ outcome: "REJECTED" }],
		status: "FAILED",
	});
	expect(artifact.judgeProviderCalls).toEqual(EXPECTED_RETRY_PROVIDER_CALLS);
	expect(artifact.judgeCostUsd).toBeCloseTo(EXPECTED_RETRY_JUDGE_COST_USD);
	expect(artifact.ceilingStop.spentUsd).toBeCloseTo(EXPECTED_STOP_SPEND_USD);
}
async function includesJudgmentInRunClock(): Promise<void> {
	const inputs = await citedFinalJudgeInputs();
	let clockMs = 1000;

	const artifact = await judgeRun({
		artifactInputs: inputs,
		elapsedMs: () => clockMs,
		invoke: async () => {
			clockMs += PROVIDER_TURN_ELAPSED_MS;

			return await Promise.resolve(
				JSON.stringify({
					session_id: "judge-session",
					structured_output: completeGrade("PASS"),
					total_cost_usd: 0.1,
				}),
			);
		},
		reviewFile: "/runs/review.md",
		spendCeiling: ampleSpendCeiling(),
		writeFailedArtifact: async () => {
			await Promise.resolve();
		},
	});

	expect(artifact).toMatchObject({
		elapsedMs: 6000,
		judgeContractSha256: FINAL_JUDGE_CONTRACT_SHA256,
		reviewFile: "/runs/review.md",
		status: "AWAITING_HUMAN_REVIEW",
	});
}
describe(buildRunArtifact.name, () => {
	describe(runFinalJudge.name, () => {
		it(
			"writes the failed main artifact after two rejected payloads",
			recordsRejectedFinalPayloads,
		);
		it(
			"records the ceiling stop and the paid attempt when the ceiling refuses its retry",
			recordsRefusedRetrySpend,
		);
		it(
			"writes no failed artifact when the Judge fails with budget left",
			keepsFailureWithBudgetLeft,
		);
		it(
			"records the ceiling stop and every paid call when the retry halts at its clamped budget",
			recordsBudgetHaltedRetry,
		);
	});
	describe(judgeRun.name, () => {
		it(
			"builds the graded artifact with the run clock read once the judge returns",
			includesJudgmentInRunClock,
		);
	});
});
