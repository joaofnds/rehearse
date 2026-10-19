import { describe, expect, it } from "bun:test";

import { runStageJudge } from "./stage-grading";
import { stageJudgeInput } from "./stage-grading-test-fixtures";
import { rubricSource } from "./stage-judge-test-fixtures";
import { judgeBudget } from "./test-support";

const CALL_COUNT_INCREMENT = 1;

function doesNotRetryInvocationFailure(): void {
	const expectedCalls = 1;

	let calls = 0;
	const failure = new Error("Stage Judge command timed out");

	expect(
		runStageJudge(
			{ budget: judgeBudget(), effort: undefined, model: "sonnet" },
			{ input: stageJudgeInput("shape"), source: rubricSource },
			{
				invoke: async () => {
					calls += CALL_COUNT_INCREMENT;

					return await Promise.reject(failure);
				},
			},
		),
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
		runStageJudge(
			{ budget: judgeBudget(), effort: undefined, model: "sonnet" },
			{ input: stageJudgeInput("shape"), source: rubricSource },
			{
				invoke: async () => {
					calls += CALL_COUNT_INCREMENT;

					return await Promise.resolve(
						JSON.stringify({
							is_error: true,
							result: "Claude session failed",
							session_id: "judge-session",
						}),
					);
				},
			},
		),
	).rejects.toThrow("Claude session failed");
	expect(calls).toBe(expectedCalls);
}

describe(runStageJudge.name, () => {
	it("does not retry an invocation failure", doesNotRetryInvocationFailure);

	it(
		"does not retry a Claude error envelope",
		doesNotRetryProviderErrorEnvelope,
	);
});
