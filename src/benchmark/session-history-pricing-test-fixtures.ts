import syntheticRateProvenance from "#benchmark/rate-catalog-test-support";
import type { SessionHistoryRequestSeries } from "#benchmark/session-history";
import { sessionHistoryRequestSeries } from "#benchmark/session-history";

import { row } from "./session-history-event-test-fixtures";

const INHERITED_REQUEST_PREFIX_LINES = 1;

const NO_PREFIX_LINES = 0;

const rates = {
	currency: "USD",
	models: [
		{
			cacheReadUsdPerMillion: 0.3,
			cacheWrite1hUsdPerMillion: 4,
			cacheWrite5mUsdPerMillion: 3.75,
			inputUsdPerMillion: 3,
			model: "claude-sonnet-5",
			outputUsdPerMillion: 15,
		},
	],
	provenance: syntheticRateProvenance,
	schemaVersion: 1,
	source: "test catalog",
	version: "2026-09-15",
} as const;

const bothModels = {
	...rates,
	models: [
		...rates.models,
		{
			cacheReadUsdPerMillion: 1.5,
			cacheWrite1hUsdPerMillion: 30,
			cacheWrite5mUsdPerMillion: 18.75,
			inputUsdPerMillion: 15,
			model: "claude-opus-5",
			outputUsdPerMillion: 15,
		},
	],
} as const;

const pricedTranscript = [
	row({
		cwd: "/work",
		message: {
			content: [{ text: "reply", type: "text" }],
			model: "claude-opus-5",
			usage: {
				cache_creation: {
					ephemeral_1h_input_tokens: 9,
					ephemeral_5m_input_tokens: 0,
				},
				cache_creation_input_tokens: 9,
				cache_read_input_tokens: 5,
				input_tokens: 7,
				output_tokens: 90_592,
			},
		},
		requestId: "req-inherited",
		timestamp: "2026-09-14T00:00:01.000Z",
		type: "assistant",
	}),
	row({
		cwd: "/work",
		message: {
			content: [{ text: "reply", type: "text" }],
			model: "claude-sonnet-5",
			usage: {
				cache_creation: {
					ephemeral_1h_input_tokens: 251_695,
					ephemeral_5m_input_tokens: 0,
				},
				cache_creation_input_tokens: 251_695,
				cache_read_input_tokens: 0,
				input_tokens: 2,
				output_tokens: 151,
			},
		},
		requestId: "req-attempt",
		timestamp: "2026-09-14T00:00:02.000Z",
		type: "assistant",
	}),
].join("\n");

function seriesWith(prefixLinesExcluded?: number): SessionHistoryRequestSeries {
	return sessionHistoryRequestSeries({
		prefixLinesExcluded,
		transcript: pricedTranscript,
	});
}

export {
	rates,
	bothModels,
	pricedTranscript,
	seriesWith,
	INHERITED_REQUEST_PREFIX_LINES,
	NO_PREFIX_LINES,
};
