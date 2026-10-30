import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import { WorkflowExecutionError, runWorkflowStage } from "./workflow";
import type { ProductOwner, WorkflowStageRequest } from "./workflow";
import {
	budgetHalt,
	questionTurn,
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

interface SessionFailureExample {
	readonly moment: string;
	readonly request: Partial<WorkflowStageRequest>;
	readonly responses: readonly (string | Readonly<Error>)[];
	readonly sessionId: string;
}

async function namesTheSessionWhoseTranscriptHoldsTheFailure({
	request,
	responses,
	sessionId,
}: SessionFailureExample): Promise<void> {
	const execution = runWorkflowStage(
		workflowStageRequest({ taskId: "ACT-22.1", ...request }),
		queuedResponses(responses),
	);

	const failure = await failureOf(execution);

	expect(failure).toMatchObject({ sessionId });
}

const failingProductOwner: ProductOwner = {
	ask: async () => await Promise.reject(new Error("product owner failed")),
	snapshot: () => ({ providerCalls: [], sessionId: "po-session", spentUsd: 0 }),
};

const sessionFailures: SessionFailureExample[] = [
	{
		moment: "before its first turn",
		request: {},
		responses: [new Error("claude exited with code 143")],
		sessionId: "stage-session",
	},
	{
		moment: "after a turn",
		request: {},
		responses: [
			questionTurn({ totalCostUsd: 0.3 }),
			new Error("worker invocation failed"),
		],
		sessionId: "worker-session",
	},
	{
		moment: "in a turn's structured output",
		request: {},
		responses: [
			JSON.stringify({
				session_id: "worker-session",
				structured_output: { status: "COMPLETE" },
				total_cost_usd: 0.3,
				type: "result",
			}),
		],
		sessionId: "worker-session",
	},
	{
		moment: "in its Product Owner's answer",
		request: { productOwner: failingProductOwner },
		responses: [questionTurn({ totalCostUsd: 0.3 })],
		sessionId: "worker-session",
	},
	{
		moment: "in a call the provider halted",
		request: {},
		responses: [budgetHalt({ costUsd: 0.4 })],
		sessionId: "halted-session",
	},
];

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

describe(runWorkflowStage.name, () => {
	it.each(sessionFailures)(
		"names the session whose transcript holds a failure $moment",
		namesTheSessionWhoseTranscriptHoldsTheFailure,
	);
});
