import { describe, expect, it } from "bun:test";

import { parseTranscript } from "#benchmark/transcript";

import { line, readBlock, toolResult } from "./transcript-test-fixtures";

const EXPECTED_TOOL_BLOCK_COUNT = 1;

function keepsTheRowSToolCallsAndReadsNoRequestId(): void {
	const [row] = parseTranscript(
		line({
			message: { content: [readBlock] },
			requestId: "",
			type: "assistant",
		}),
	);

	expect(row?.locatedToolUses).toHaveLength(EXPECTED_TOOL_BLOCK_COUNT);
	expect(row?.requestId).toBeUndefined();
}

function keepsTheRowSToolResultsAndReadsNoMetaDelivery(): void {
	const [row] = parseTranscript(
		line({
			isMeta: "true",
			message: { content: [toolResult("toolu_1")] },
			parentUuid: 7,
			sourceToolUseID: "",
			type: "user",
		}),
	);

	expect(row?.locatedToolResults).toHaveLength(EXPECTED_TOOL_BLOCK_COUNT);
	expect(row?.sourceToolUseId).toBeUndefined();
}

function readsTheRowAsNoTurn(): void {
	const [row] = parseTranscript(
		line({
			message: {
				content: [{ content: "x", tool_use_id: "", type: "tool_result" }],
			},
			type: "user",
		}),
	);

	expect(row?.userTurn).toBeUndefined();
}

describe(parseTranscript.name, () => {
	describe("when a row's turn fields are malformed", () => {
		it(
			"keeps the row's tool calls and reads no request id",
			keepsTheRowSToolCallsAndReadsNoRequestId,
		);
		it(
			"keeps the row's tool results and reads no meta delivery",
			keepsTheRowSToolResultsAndReadsNoMetaDelivery,
		);
	});
	describe("when a user row holds a malformed tool result", () => {
		it("reads the row as no turn", readsTheRowAsNoTurn);
	});
});
