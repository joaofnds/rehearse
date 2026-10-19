import { describe, expect, it } from "bun:test";

import { fakeRunEventRecorder } from "./test-support";
import { runWorkflowStage } from "./workflow";
import {
	queuedResponses,
	testResources,
	workflowStageRequest,
} from "./workflow-test-fixtures";

testResources.registerCleanup();

const INJECTED_ELAPSED_MS = 500;

const EXPECTED_FIRST_STAGE_COST_USD = 12.4;
const EXPECTED_RESUMED_COST_USD = 0.2;

async function retainsEveryWorkerCallAndProviderTurn(): Promise<void> {
	const responses = [
		JSON.stringify({
			num_turns: 2,
			session_id: "worker-session",
			structured_output: { message: "Which scope?", status: "QUESTION" },
			total_cost_usd: 0.3,
			type: "result",
			usage: {
				cache_creation_input_tokens: 8,
				cache_read_input_tokens: 7,
				input_tokens: 60,
				output_tokens: 12,
			},
		}),
		JSON.stringify({
			session_id: "worker-session",
			structured_output: { message: "Shaped", status: "COMPLETE" },
			total_cost_usd: 0.4,
			type: "result",
		}),
	];

	const transcript = await runWorkflowStage(
		workflowStageRequest(),
		queuedResponses(responses),
	);

	expect(transcript.providerCalls).toEqual([
		{
			metrics: {
				cacheReadTokens: 7,
				cacheWriteTokens: 8,
				costUsd: 0.3,
				inputTokens: 60,
				outputTokens: 12,
				turns: 2,
			},
		},
		{},
	]);
}

async function chargesAResumedWorkerCallOnlyItsIncreaseOverTheSessionSReportedTotal(): Promise<void> {
	const expectedCostUsd = 12.6;

	const responses = [
		JSON.stringify({
			num_turns: 47,
			session_id: "worker-session",
			structured_output: { message: "Which scope?", status: "QUESTION" },
			total_cost_usd: 12.4,
			type: "result",
			usage: {
				cache_creation_input_tokens: 8,
				cache_read_input_tokens: 7,
				input_tokens: 60,
				output_tokens: 21_774,
			},
		}),
		JSON.stringify({
			num_turns: 7,
			session_id: "worker-session",
			structured_output: { message: "Built", status: "COMPLETE" },
			total_cost_usd: 12.6,
			type: "result",
			usage: {
				cache_creation_input_tokens: 8,
				cache_read_input_tokens: 7,
				input_tokens: 6,
				output_tokens: 2450,
			},
		}),
	];

	const transcript = await runWorkflowStage(
		workflowStageRequest({
			sessionBudgetUsd: 15,
			skill: "build",
			stage: "build",
		}),
		queuedResponses(responses),
	);

	const [first, resumed] = transcript.providerCalls;

	expect(transcript.costUsd).toBeCloseTo(expectedCostUsd);
	expect(first?.metrics?.costUsd).toBe(EXPECTED_FIRST_STAGE_COST_USD);
	expect(resumed?.metrics?.costUsd).toBeCloseTo(EXPECTED_RESUMED_COST_USD);
}

async function recordsATurnCompletedRunEventForEveryProviderTurnWithTheRunningSpend(): Promise<void> {
	const responses = [
		JSON.stringify({
			session_id: "worker-session",
			structured_output: { message: "Which scope?", status: "QUESTION" },
			total_cost_usd: 0.3,
			type: "result",
		}),
		JSON.stringify({
			session_id: "worker-session",
			structured_output: { message: "Shaped", status: "COMPLETE" },
			total_cost_usd: 0.4,
			type: "result",
		}),
	];

	const recorded: {
		readonly kind: string;
		readonly spentUsd: number;
		readonly elapsedMs: number;
	}[] = [];

	await runWorkflowStage(
		workflowStageRequest({
			elapsedMs: () => INJECTED_ELAPSED_MS,
			runEvents: {
				...fakeRunEventRecorder(),
				record: (kind, _stage, { spentUsd, elapsedMs }) => {
					recorded.push({ elapsedMs, kind, spentUsd });
				},
			},
		}),
		queuedResponses(responses),
	);

	expect(recorded).toEqual([
		{ elapsedMs: 500, kind: "turn-completed", spentUsd: 0.3 },
		{ elapsedMs: 500, kind: "turn-completed", spentUsd: 0.4 },
	]);
}

describe("workflow provider metrics", () => {
	it(
		"retains every worker call and provider turn",
		retainsEveryWorkerCallAndProviderTurn,
	);
	it(
		"charges a resumed worker call only its increase over the session's reported total",
		chargesAResumedWorkerCallOnlyItsIncreaseOverTheSessionSReportedTotal,
	);
	it(
		"records a turn-completed run event for every provider turn, with the running spend",
		recordsATurnCompletedRunEventForEveryProviderTurnWithTheRunningSpend,
	);
});
