import { describe, expect, it } from "bun:test";

import { readClaudeCallMetrics, readClaudeEnvelope } from "./claude";
import {
	EXPECTED_SONNET_COST_USD,
	MULTI_MODEL_USAGE,
} from "./claude-test-fixtures";

function retainsOneEntryPerModelOnACallThatUsedMoreThanOne(): void {
	const expectedCostUSD = 0.02;

	const envelope = readClaudeEnvelope(
		JSON.stringify({
			modelUsage: MULTI_MODEL_USAGE,
			num_turns: 2,
			session_id: "session-1",
			total_cost_usd: 0.1,
			usage: {
				cache_creation_input_tokens: 100,
				cache_read_input_tokens: 0,
				input_tokens: 4,
				output_tokens: 9,
			},
		}),
	);

	const modelUsage = readClaudeCallMetrics(envelope)?.modelUsage;

	expect(Object.keys(modelUsage ?? {})).toEqual([
		"claude-haiku-4-5-20251001",
		"claude-sonnet-5",
	]);
	expect(modelUsage?.["claude-haiku-4-5-20251001"]?.costUSD).toBe(
		expectedCostUSD,
	);
	expect(modelUsage?.["claude-sonnet-5"]?.costUSD).toBe(
		EXPECTED_SONNET_COST_USD,
	);
}

function survivesAPerModelBlockTheProviderReportsWithAZeroWindow(): void {
	const expectedContextWindow = 0;

	const envelope = readClaudeEnvelope(
		JSON.stringify({
			modelUsage: {
				"unknown-model": {
					cacheCreationInputTokens: 10,
					cacheReadInputTokens: 0,
					canonicalModel: "unknown-model",
					contextWindow: 0,
					costBasis: "list",
					costUSD: 0.5,
					inputTokens: 2,
					maxOutputTokens: 0,
					outputTokens: 4,
					provider: "firstParty",
				},
			},
			num_turns: 1,
			session_id: "session-1",
			total_cost_usd: 0.5,
			usage: {
				cache_creation_input_tokens: 10,
				cache_read_input_tokens: 0,
				input_tokens: 2,
				output_tokens: 4,
			},
		}),
	);

	expect(
		readClaudeCallMetrics(envelope)?.modelUsage?.["unknown-model"]
			?.contextWindow,
	).toBe(expectedContextWindow);
}

function survivesASubAgentSPerModelBlockWithoutCanonicalModelProviderOrCostBasis(): void {
	const expectedCostUSD = 1;

	const envelope = readClaudeEnvelope(
		JSON.stringify({
			modelUsage: {
				"claude-opus-5-5[1m]": {
					cacheCreationInputTokens: 77_748,
					cacheReadInputTokens: 614_679,
					contextWindow: 1_000_000,
					costUSD: 1,
					inputTokens: 36,
					maxOutputTokens: 128_000,
					outputTokens: 24_590,
				},
			},
			num_turns: 1,
			session_id: "session-1",
			total_cost_usd: 1,
			usage: {
				cache_creation_input_tokens: 10,
				cache_read_input_tokens: 0,
				input_tokens: 2,
				output_tokens: 4,
			},
		}),
	);

	expect(
		readClaudeCallMetrics(envelope)?.modelUsage?.["claude-opus-5-5[1m]"]
			?.costUSD,
	).toBe(expectedCostUSD);
}

function keepsACallSMetricsWhenAPerModelBlockDropsAFieldItUsedToCarry(): void {
	const envelope = readClaudeEnvelope(
		JSON.stringify({
			modelUsage: {
				"claude-opus-5-5[1m]": {
					cacheCreationInputTokens: 77_748,
					cacheReadInputTokens: 614_679,
					costUSD: 1,
					inputTokens: 36,
					maxOutputTokens: 128_000,
					outputTokens: 24_590,
				},
			},
			num_turns: 1,
			session_id: "session-1",
			total_cost_usd: 1,
			usage: {
				cache_creation_input_tokens: 10,
				cache_read_input_tokens: 0,
				input_tokens: 2,
				output_tokens: 4,
			},
		}),
	);

	expect(readClaudeCallMetrics(envelope)).toEqual({
		cacheReadTokens: 0,
		cacheWriteTokens: 10,
		costUsd: 1,
		inputTokens: 2,
		outputTokens: 4,
		turns: 1,
	});
}

describe("per-model usage", () => {
	it(
		"retains one entry per model on a call that used more than one",
		retainsOneEntryPerModelOnACallThatUsedMoreThanOne,
	);
	it(
		"survives a per-model block the provider reports with a zero window",
		survivesAPerModelBlockTheProviderReportsWithAZeroWindow,
	);
	it(
		"survives a sub-agent's per-model block without canonical model, provider or cost basis",
		survivesASubAgentSPerModelBlockWithoutCanonicalModelProviderOrCostBasis,
	);
	it(
		"keeps a call's metrics when a per-model block drops a field it used to carry",
		keepsACallSMetricsWhenAPerModelBlockDropsAFieldItUsedToCarry,
	);
});
