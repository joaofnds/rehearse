import type { JsonValue } from "#benchmark/json-value";
import type { SessionHistoryRequestEntry } from "#benchmark/session-history";
import { sessionHistoryRequestSeries } from "#benchmark/session-history";

import { row } from "./session-history-event-test-fixtures";

function assistantRow(
	second: string,
	{ requestId, model, usage }: AssistantRequest,
): JsonValue {
	const message = {
		content: [{ text: "reply", type: "text" }],
		model,
		usage: {
			cache_creation_input_tokens: usage.cacheWrite,
			cache_read_input_tokens: usage.cacheRead,
			input_tokens: usage.input,
			output_tokens: usage.output,
		},
	} satisfies JsonValue;
	const withoutRequestId = {
		cwd: "/work",
		message,
		timestamp: `2026-09-14T00:00:0${second}.000Z`,
		type: "assistant",
	} satisfies JsonValue;
	if (requestId === undefined) {
		return withoutRequestId;
	}

	return { ...withoutRequestId, requestId };
}

interface AssistantRequest {
	readonly requestId: string | null | undefined;
	readonly model: string;
	readonly usage: {
		readonly input: number;
		readonly output: number;
		readonly cacheRead: number;
		readonly cacheWrite: number;
	};
}

function usageOf(
	transcript: readonly string[],
): SessionHistoryRequestEntry | undefined {
	const [entry] = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript: transcript.join("\n"),
	}).entries;

	return entry;
}

function streamedRow(
	requestId: string,
	output: number,
	stopReason: string | null,
): string {
	return row({
		message: {
			model: "claude-opus-5",
			stop_reason: stopReason,
			usage: {
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 100,
				input_tokens: 2,
				output_tokens: output,
			},
		},
		requestId,
		type: "assistant",
	});
}

const multiRequestTranscript = [
	row(
		assistantRow("1", {
			model: "claude-opus-5",
			requestId: "req-inherited",
			usage: {
				cacheRead: 100,
				cacheWrite: 20,
				input: 2,
				output: 10,
			},
		}),
	),
	"",
	row(
		assistantRow("2", {
			model: "claude-sonnet-5",
			requestId: "req-attempt",
			usage: {
				cacheRead: 200,
				cacheWrite: 251_695,
				input: 3,
				output: 151,
			},
		}),
	),
	row(
		assistantRow("3", {
			model: "claude-sonnet-5",
			requestId: "req-attempt-2",
			usage: {
				cacheRead: 300,
				cacheWrite: 40,
				input: 5,
				output: 7,
			},
		}),
	),
].join("\n");

function syntheticRequestTranscript(
	requestId: AssistantRequest["requestId"],
): string {
	return [
		row(
			assistantRow("1", {
				model: "<synthetic>",
				requestId,
				usage: {
					cacheRead: 0,
					cacheWrite: 0,
					input: 0,
					output: 0,
				},
			}),
		),
		row(
			assistantRow("2", {
				model: "claude-sonnet-5",
				requestId: "req-a",
				usage: {
					cacheRead: 0,
					cacheWrite: 251_695,
					input: 2,
					output: 151,
				},
			}),
		),
	].join("\n");
}

export {
	assistantRow,
	usageOf,
	streamedRow,
	multiRequestTranscript,
	syntheticRequestTranscript,
};

export type { AssistantRequest };
