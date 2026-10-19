import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import { WorkflowExecutionError, runWorkflowStage } from "./workflow";
import {
	queuedResponses,
	testResources,
	workflowStageRequest,
} from "./workflow-test-fixtures";
import type { WorkflowFailureExample } from "./workflow-test-fixtures";

testResources.registerCleanup();

async function carriesCompletedCallsAcrossBoundaryFailure({
	laterResponse,
	costUsd,
}: WorkflowFailureExample): Promise<void> {
	const firstCall = {
		cacheReadTokens: 7,
		cacheWriteTokens: 8,
		costUsd: 0.3,
		inputTokens: 60,
		outputTokens: 12,
		turns: 2,
	};
	const responses: (string | Readonly<Error>)[] = [
		JSON.stringify({
			num_turns: firstCall.turns,
			session_id: "worker-session",
			structured_output: { message: "Which scope?", status: "QUESTION" },
			total_cost_usd: firstCall.costUsd,
			type: "result",
			usage: {
				cache_creation_input_tokens: firstCall.cacheWriteTokens,
				cache_read_input_tokens: firstCall.cacheReadTokens,
				input_tokens: firstCall.inputTokens,
				output_tokens: firstCall.outputTokens,
			},
		}),
		laterResponse,
	];

	const execution = runWorkflowStage(
		workflowStageRequest({ taskId: "ACT-22.1" }),
		queuedResponses(responses),
	);

	const failure = await failureOf(execution);

	expect(failure).toBeInstanceOf(WorkflowExecutionError);
	expect(failure).toMatchObject({
		costUsd,
		name: "WorkflowExecutionError",
		providerCalls: [{ metrics: firstCall }, {}],
	});
}

async function doesNotClassifyBudgetExhaustionAsAFailedProviderCall(): Promise<void> {
	const responses = [
		JSON.stringify({
			session_id: "worker-session",
			structured_output: { message: "Which scope?", status: "QUESTION" },
			total_cost_usd: 5,
			type: "result",
		}),
	];

	const failure = await failureOf(
		runWorkflowStage(
			workflowStageRequest({ taskId: "ACT-22.1" }),
			queuedResponses(responses),
		),
	);

	expect(failure).not.toBeInstanceOf(WorkflowExecutionError);
	expect(failure).toMatchObject({
		message: "Claude session exhausted its budget",
	});
}

async function carriesTheUnderlyingReasonInTheFailureMessage(): Promise<void> {
	const failure = await failureOf(
		runWorkflowStage(
			workflowStageRequest({
				skill: "build",
				stage: "build",
				taskId: "ACT-22.1",
			}),
			async () =>
				await Promise.reject(new Error("claude exited with code 143")),
		),
	);

	expect(failure).toBeInstanceOf(WorkflowExecutionError);
	expect(failure).toMatchObject({
		message: "Worker execution failed: claude exited with code 143",
	});
}

describe("workflow provider metrics", () => {
	it.each([
		{
			boundary: "invocation",
			costUsd: undefined,
			laterResponse: new Error("worker invocation failed"),
		},
		{ boundary: "envelope decoding", costUsd: undefined, laterResponse: "{" },
		{
			boundary: "structured output decoding",
			costUsd: 0.3,
			laterResponse: JSON.stringify({
				session_id: "worker-session",
				structured_output: { status: "COMPLETE" },
				total_cost_usd: 0.3,
				type: "result",
			}),
		},
	])(
		"carries completed calls across $boundary failure",
		carriesCompletedCallsAcrossBoundaryFailure,
	);
	it(
		"does not classify budget exhaustion as a failed provider call",
		doesNotClassifyBudgetExhaustionAsAFailedProviderCall,
	);
	it(
		"carries the underlying reason in the failure message",
		carriesTheUnderlyingReasonInTheFailureMessage,
	);
});
