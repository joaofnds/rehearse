import { row } from "./session-history-event-test-fixtures";

const BEFORE_COMPACTION_INPUT_TOKENS = 100;

const AFTER_COMPACTION_INPUT_TOKENS = 20;

function assistant(
	requestId: string,
	timestamp: string,
	tokens: number,
): string {
	return row({
		cwd: "/work",
		message: {
			content: [{ text: "reply", type: "text" }],
			model: "claude-sonnet-5",
			usage: {
				cache_creation: {
					ephemeral_1h_input_tokens: 0,
					ephemeral_5m_input_tokens: 0,
				},
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
				input_tokens: tokens,
				output_tokens: 1,
			},
		},
		requestId,
		timestamp,
		type: "assistant",
	});
}

const withCompaction = [
	assistant(
		"req-1",
		"2026-09-14T00:00:01.000Z",
		BEFORE_COMPACTION_INPUT_TOKENS,
	),
	row({
		compactMetadata: { preTokens: 101, trigger: "auto" },
		cwd: "/work",
		subtype: "compact_boundary",
		timestamp: "2026-09-14T00:00:02.000Z",
		type: "system",
	}),
	assistant("req-2", "2026-09-14T00:00:03.000Z", AFTER_COMPACTION_INPUT_TOKENS),
].join("\n");

export { assistant, withCompaction };
