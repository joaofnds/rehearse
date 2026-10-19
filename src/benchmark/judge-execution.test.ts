import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import { runJudge } from "./judge";
import { JudgeExecutionError } from "./judge-attempt";
import JudgeResponseScript from "./judge-script-test-fixture";
import {
	completeGrade,
	gradeWith,
	meteredResponse,
	unavailableEvidenceGrade,
} from "./judge-test-fixtures";

const CALL_COUNT_INCREMENT = 1;

async function retainsCompleteProviderMetrics(): Promise<void> {
	const result = await gradeWith(
		async () =>
			await Promise.resolve(
				JSON.stringify({
					num_turns: 3,
					session_id: "judge-session",
					structured_output: completeGrade("PASS"),
					total_cost_usd: 0.1,
					usage: {
						cache_creation_input_tokens: 40,
						cache_read_input_tokens: 30,
						input_tokens: 100,
						output_tokens: 20,
					},
				}),
			),
	);

	const [observedFirstAttempt] = result.attempts;

	expect(observedFirstAttempt?.metrics).toEqual({
		cacheReadTokens: 30,
		cacheWriteTokens: 40,
		costUsd: 0.1,
		inputTokens: 100,
		outputTokens: 20,
		turns: 3,
	});
}

async function retainsRejectedAttemptWhenRetryFails(): Promise<void> {
	const expectedCalls = 2;

	const invocationFailure = new Error("Judge command timed out");
	const invalidGrade = unavailableEvidenceGrade();

	const firstCall = {
		cacheReadTokens: 30,
		cacheWriteTokens: 40,
		costUsd: 0.1,
		inputTokens: 100,
		outputTokens: 20,
		turns: 3,
	};

	const script = new JudgeResponseScript(
		[meteredResponse(invalidGrade, firstCall)],
		invocationFailure,
	);
	const failure = await failureOf(gradeWith(script.invoke));

	expect(failure).toBeInstanceOf(JudgeExecutionError);
	expect(failure).toMatchObject({
		attempts: [
			{
				costUsd: 0.1,
				error:
					"Judge cited unavailable evidence for tests: diff:src/missing.ts",
				metrics: { ...firstCall },
				outcome: "REJECTED",
				payload: invalidGrade,
			},
		],
		cause: invocationFailure,
		costUsd: 0.1,
		providerCalls: [{ metrics: { ...firstCall } }, {}],
	});
	expect(script.prompts.length).toBe(expectedCalls);
}

function doesNotRetryInvocationFailure(): void {
	const expectedCalls = 1;

	let calls = 0;
	const failure = new Error("Judge command timed out");

	expect(
		gradeWith(async () => {
			calls += CALL_COUNT_INCREMENT;

			return await Promise.reject(failure);
		}),
	).rejects.toMatchObject({
		attempts: [],
		cause: failure,
		costUsd: 0,
		name: "JudgeExecutionError",
		providerCalls: [{}],
	});
	expect(calls).toBe(expectedCalls);
}

function doesNotRetryProviderErrorEnvelope(): void {
	const expectedCalls = 1;

	let calls = 0;

	expect(
		gradeWith(async () => {
			calls += CALL_COUNT_INCREMENT;

			return await Promise.resolve(
				JSON.stringify({
					is_error: true,
					result: "Claude session failed",
					session_id: "judge-session",
				}),
			);
		}),
	).rejects.toThrow("Claude session failed");
	expect(calls).toBe(expectedCalls);
}

describe(runJudge.name, () => {
	it(
		"retains complete provider metrics on an attempt",
		retainsCompleteProviderMetrics,
	);

	it(
		"carries a rejected attempt when the retry invocation fails",
		retainsRejectedAttemptWhenRetryFails,
	);

	it("does not retry an invocation failure", doesNotRetryInvocationFailure);

	it(
		"does not retry a Claude error envelope",
		doesNotRetryProviderErrorEnvelope,
	);
});
