import { describe, expect, it } from "bun:test";

import { parseTranscript, toolUses } from "#benchmark/transcript";

import {
	assistantWith,
	bashBlock,
	line,
	readBlock,
} from "./transcript-test-fixtures";

const EXPECTED_NONBLANK_MESSAGE_COUNT = 1;

function collectsTheToolUseBlocksOfEveryAssistantRecord(): void {
	const transcript = parseTranscript(
		[
			line({ message: { content: "hello" }, type: "user" }),
			assistantWith({ text: "thinking", type: "text" }, readBlock),
			assistantWith(bashBlock),
		].join("\n"),
	);

	expect(toolUses(transcript).map(({ name }) => name)).toEqual([
		"Read",
		"Bash",
	]);
}

function readsARecordTypeItDoesNotRecognizeAsOneWithNoToolCalls(): void {
	const transcript = parseTranscript(
		[
			line({ operation: "enqueue", type: "queue-operation" }),
			line({ payload: { anything: true }, type: "future-record-kind" }),
		].join("\n"),
	);

	expect(toolUses(transcript)).toEqual([]);
}

function readsALineThatIsNotJSONAsOneWithNoToolCalls(): void {
	expect(toolUses(parseTranscript("not json at all\n"))).toEqual([]);
}

function ignoresBlankLinesIncludingATrailingNewline(): void {
	expect(parseTranscript(`${assistantWith(readBlock)}\n\n`)).toHaveLength(
		EXPECTED_NONBLANK_MESSAGE_COUNT,
	);
}

describe(parseTranscript.name, () => {
	it(
		"collects the tool_use blocks of every assistant record",
		collectsTheToolUseBlocksOfEveryAssistantRecord,
	);
	it(
		"reads a record type it does not recognize as one with no tool calls",
		readsARecordTypeItDoesNotRecognizeAsOneWithNoToolCalls,
	);
	it(
		"reads a line that is not JSON as one with no tool calls",
		readsALineThatIsNotJSONAsOneWithNoToolCalls,
	);
	it(
		"ignores blank lines, including a trailing newline",
		ignoresBlankLinesIncludingATrailingNewline,
	);
});
