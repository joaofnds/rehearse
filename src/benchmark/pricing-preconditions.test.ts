import { describe, expect, it } from "bun:test";

import type { UnpricedState } from "#benchmark/context-evidence-contract";
import {
	UNPRICED_REASONS,
	UNPRICED_STATES,
} from "#benchmark/context-evidence-contract";
import type { JsonValue } from "#benchmark/json-value";
import { committedRateCatalog } from "#benchmark/rate-catalog";
import type { SessionHistoryAttemptCost } from "#benchmark/session-history";
import {
	sessionHistoryAttemptCost,
	sessionHistoryRequestSeries,
} from "#benchmark/session-history";

const DEFAULT_CACHE_WRITE_TOKENS = 10;

const CONTRADICTING_AGGREGATE_CACHE_WRITE_TOKENS = 99;

function assistantRow(message: Readonly<Record<string, JsonValue>>): string {
	return JSON.stringify({
		cwd: "/work",
		message: { content: [{ text: "reply", type: "text" }], ...message },
		requestId: "req-attempt",
		timestamp: "2026-09-14T00:00:01.000Z",
		type: "assistant",
	});
}

function usage(
	cacheCreation: JsonValue,
	cacheWriteTokens = DEFAULT_CACHE_WRITE_TOKENS,
): JsonValue {
	return {
		cache_creation: cacheCreation,
		cache_creation_input_tokens: cacheWriteTokens,
		cache_read_input_tokens: 3,
		input_tokens: 5,
		output_tokens: 7,
	};
}

const completeSplit = {
	ephemeral_1h_input_tokens: 10,
	ephemeral_5m_input_tokens: 0,
};

function calculatedReading(
	transcript: string,
): SessionHistoryAttemptCost["calculated"] {
	return sessionHistoryAttemptCost({
		rates: committedRateCatalog,
		reportedCostUsd: 1,
		series: sessionHistoryRequestSeries({
			prefixLinesExcluded: 0,
			transcript,
		}),
	}).calculated;
}

const preconditions: readonly {
	readonly state: UnpricedState;
	readonly reason: string;
	readonly transcript: string;
}[] = [
	{
		reason: "usage is in conflict",
		state: "usage-conflict",
		transcript: [
			assistantRow({ model: "claude-sonnet-5", usage: usage(completeSplit) }),
			assistantRow({
				model: "claude-sonnet-5",
				usage: usage(completeSplit, CONTRADICTING_AGGREGATE_CACHE_WRITE_TOKENS),
			}),
		].join("\n"),
	},
	{
		reason: "the executing model is in conflict",
		state: "model-conflict",
		transcript: [
			assistantRow({ model: "claude-sonnet-5", usage: usage(completeSplit) }),
			assistantRow({ model: "claude-opus-5", usage: usage(completeSplit) }),
		].join("\n"),
	},
	{
		reason: "the row names no model",
		state: "model-missing",
		transcript: assistantRow({ usage: usage(completeSplit) }),
	},
	{
		reason: "the cache-write TTL split is missing",
		state: "ttl-split-missing",
		transcript: assistantRow({
			model: "claude-sonnet-5",
			usage: {
				cache_creation_input_tokens: 10,
				cache_read_input_tokens: 3,
				input_tokens: 5,
				output_tokens: 7,
			},
		}),
	},
	{
		reason: "the cache-write TTL split is in conflict",
		state: "ttl-split-conflict",
		transcript: assistantRow({
			model: "claude-sonnet-5",
			usage: usage({
				ephemeral_1h_input_tokens: 4,
				ephemeral_5m_input_tokens: 0,
			}),
		}),
	},
	{
		reason: "no rate is catalogued for the executing model",
		state: "rates-missing",
		transcript: assistantRow({
			model: "claude-uncatalogued-9",
			usage: usage(completeSplit),
		}),
	},
];

describe("pricing preconditions", () => {
	for (const { state, reason, transcript } of preconditions) {
		it(`reports ${state} as its own named reason rather than a cost`, () => {
			const reading = calculatedReading(transcript);

			expect(reading.state).toBe("incomplete");
			expect(reading.state === "incomplete" ? reading.reasons : []).toContain(
				reason,
			);
		});
	}

	it("gives every precondition the two projections share a distinct reason", () => {
		const reasons = UNPRICED_STATES.map((state) => UNPRICED_REASONS[state]);

		expect(new Set(reasons).size).toBe(UNPRICED_STATES.length);
	});
});
