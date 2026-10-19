import { describe, expect, it } from "bun:test";

import { readClaudeCallMetrics, readClaudeEnvelope } from "./claude";

function mapsCompleteProviderUsageWithoutConvertingFields(): void {
	const envelope = readClaudeEnvelope(
		JSON.stringify({
			duration_api_ms: 900,
			duration_ms: 1200,
			num_turns: 7,
			session_id: "session-1",
			total_cost_usd: 0.5,
			usage: {
				cache_creation_input_tokens: 40,
				cache_read_input_tokens: 30,
				input_tokens: 100,
				output_tokens: 20,
			},
		}),
	);

	expect(readClaudeCallMetrics(envelope)).toEqual({
		apiDurationMs: 900,
		cacheReadTokens: 30,
		cacheWriteTokens: 40,
		costUsd: 0.5,
		durationMs: 1200,
		inputTokens: 100,
		outputTokens: 20,
		turns: 7,
	});
}

function readsTheMetricsPastUsageFieldsTheProviderAdded(): void {
	const expectedInputTokens = 100;

	const envelope = readClaudeEnvelope(
		JSON.stringify({
			duration_api_ms: 900,
			duration_ms: 1200,
			num_turns: 7,
			session_id: "session-1",
			total_cost_usd: 0.5,
			usage: {
				cache_creation: { ephemeral_5m_input_tokens: 0 },
				cache_creation_input_tokens: 40,
				cache_read_input_tokens: 30,
				inference_geo: "us",
				input_tokens: 100,
				iterations: 1,
				output_tokens: 20,
				output_tokens_details: { reasoning_tokens: 0 },
				server_tool_use: { web_search_requests: 0 },
				service_tier: "standard",
				speed: "fast",
			},
		}),
	);

	expect(readClaudeCallMetrics(envelope)?.inputTokens).toBe(
		expectedInputTokens,
	);
}

function preservesMissingRequiredMetricsAsAbsence(): void {
	const envelope = readClaudeEnvelope(
		JSON.stringify({ session_id: "session-1", total_cost_usd: 0.5 }),
	);

	expect(readClaudeCallMetrics(envelope)).toBeUndefined();
}

function retainsTheProviderSPerModelUsageBlock(): void {
	const envelope = readClaudeEnvelope(
		JSON.stringify({
			modelUsage: {
				"claude-haiku-4-5-20251001": {
					cacheCreationInputTokens: 14_973,
					cacheReadInputTokens: 0,
					canonicalModel: "claude-haiku-4-5",
					contextWindow: 200_000,
					costBasis: "list",
					costUSD: 0.029973,
					inputTokens: 2,
					maxOutputTokens: 32_000,
					outputTokens: 5,
					provider: "firstParty",
				},
			},
			num_turns: 1,
			session_id: "session-1",
			total_cost_usd: 0.029973,
			usage: {
				cache_creation_input_tokens: 14_973,
				cache_read_input_tokens: 0,
				input_tokens: 2,
				output_tokens: 5,
			},
		}),
	);

	expect(readClaudeCallMetrics(envelope)?.modelUsage).toEqual({
		"claude-haiku-4-5-20251001": {
			cacheCreationInputTokens: 14_973,
			cacheReadInputTokens: 0,
			canonicalModel: "claude-haiku-4-5",
			contextWindow: 200_000,
			costBasis: "list",
			costUSD: 0.029973,
			inputTokens: 2,
			maxOutputTokens: 32_000,
			outputTokens: 5,
			provider: "firstParty",
		},
	});
}

function readsTheBlockPastPerModelFieldsTheProviderAdded(): void {
	const envelope = readClaudeEnvelope(
		JSON.stringify({
			modelUsage: {
				"claude-sonnet-5": {
					cacheCreationInputTokens: 19_929,
					cacheReadInputTokens: 0,
					canonicalModel: "claude-sonnet-5",
					contextWindow: 1_000_000,
					costBasis: "list",
					costUSD: 0.07976,
					inputTokens: 2,
					maxOutputTokens: 64_000,
					outputTokens: 4,
					provider: "firstParty",
					thinkingTokens: 0,
					webSearchRequests: 0,
				},
			},
			num_turns: 1,
			session_id: "session-1",
			total_cost_usd: 0.07976,
			usage: {
				cache_creation_input_tokens: 19_929,
				cache_read_input_tokens: 0,
				input_tokens: 2,
				output_tokens: 4,
			},
		}),
	);

	expect(
		readClaudeCallMetrics(envelope)?.modelUsage?.["claude-sonnet-5"],
	).toMatchObject({ thinkingTokens: 0, webSearchRequests: 0 });
}

function preservesAMissingPerModelBlockAsAbsence(): void {
	const envelope = readClaudeEnvelope(
		JSON.stringify({
			num_turns: 7,
			session_id: "session-1",
			total_cost_usd: 0.5,
			usage: {
				cache_creation_input_tokens: 40,
				cache_read_input_tokens: 30,
				input_tokens: 100,
				output_tokens: 20,
			},
		}),
	);

	const metrics = readClaudeCallMetrics(envelope);

	expect(metrics).toBeDefined();
	expect(metrics && "modelUsage" in metrics).toBe(false);
}

describe(readClaudeCallMetrics.name, () => {
	it(
		"maps complete provider usage without converting fields",
		mapsCompleteProviderUsageWithoutConvertingFields,
	);
	it(
		"reads the metrics past usage fields the provider added",
		readsTheMetricsPastUsageFieldsTheProviderAdded,
	);
	it(
		"preserves missing required metrics as absence",
		preservesMissingRequiredMetricsAsAbsence,
	);
});
describe("per-model usage", () => {
	it(
		"retains the provider's per-model usage block",
		retainsTheProviderSPerModelUsageBlock,
	);
	it(
		"reads the block past per-model fields the provider added",
		readsTheBlockPastPerModelFieldsTheProviderAdded,
	);
	it(
		"preserves a missing per-model block as absence",
		preservesAMissingPerModelBlockAsAbsence,
	);
	it(
		"retains the provider's per-model usage block",
		retainsTheProviderSPerModelUsageBlock,
	);
	it(
		"reads the block past per-model fields the provider added",
		readsTheBlockPastPerModelFieldsTheProviderAdded,
	);
	it(
		"preserves a missing per-model block as absence",
		preservesAMissingPerModelBlockAsAbsence,
	);
});
