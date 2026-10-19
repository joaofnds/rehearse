import { describe, expect, it } from "bun:test";

import {
	filesRead,
	parseTranscript,
	toolUses,
	toolUsesExceptFailed,
} from "#benchmark/transcript";

import {
	assistantWith,
	bashBlock,
	line,
	readBlock,
	readCall,
	toolResult,
} from "./transcript-test-fixtures";

function returnsEveryToolUseExceptThoseAnsweredWithAnError(): void {
	const transcript = parseTranscript(
		[
			assistantWith(readCall("toolu_ok"), readCall("toolu_failed")),
			line({
				message: {
					content: [toolResult("toolu_ok"), toolResult("toolu_failed", true)],
				},
				type: "user",
			}),
		].join("\n"),
	);

	expect(toolUsesExceptFailed(transcript).map((use) => use.id)).toEqual([
		"toolu_ok",
	]);
}

function returnsTheFilePathOfEveryReadCallAndNothingElse(): void {
	const transcript = parseTranscript(assistantWith(readBlock, bashBlock));

	expect(filesRead(toolUses(transcript))).toEqual(["/tmp/x.md"]);
}

describe(toolUsesExceptFailed.name, () => {
	it(
		"returns every tool use except those answered with an error",
		returnsEveryToolUseExceptThoseAnsweredWithAnError,
	);
});
describe(filesRead.name, () => {
	it(
		"returns the file_path of every Read call and nothing else",
		returnsTheFilePathOfEveryReadCallAndNothingElse,
	);
});
