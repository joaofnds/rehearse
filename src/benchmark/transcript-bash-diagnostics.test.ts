import { describe, expect, it } from "bun:test";

import { parseTranscript, transcriptDiagnostics } from "#benchmark/transcript";

import {
	boundedPreviewExpected,
	missingBashCommandExpected,
} from "./transcript-command-diagnostic-fixtures";
import {
	assistantWith,
	bashCall,
	line,
	toolResult,
} from "./transcript-test-fixtures";

const PWD_FIRST_LINE_NUMBER = 1;

const PWD_REPEAT_LINE_NUMBER = 5;

const LS_FIRST_LINE_NUMBER = 2;

const LS_REPEAT_LINE_NUMBER = 4;

const EXPECTED_REPEATED_COMMAND_COUNT = 1;

const FIRST_REPEATED_COMMAND_INDEX = 0;

const EXPECTED_PREVIEW_CHARACTERS = 160;

const OVER_LIMIT_PREVIEW_CHARACTERS = 161;

const COMBINING_MARK_STRESS_COUNT = 10_000;

function marksABashCallWithoutAStringCommandPartial(): void {
	const transcript = parseTranscript(
		[
			assistantWith({
				id: "bash-1",
				input: {},
				name: "Bash",
				type: "tool_use",
			}),
			line({
				message: { content: [toolResult("bash-1")] },
				type: "user",
			}),
		].join("\n"),
	);

	expect(
		transcriptDiagnostics({
			lines: transcript,
			prefixLinesExcluded: 0,
			sourceAvailable: true,
		}),
	).toEqual(missingBashCommandExpected);
}

function ordersRepeatGroupsAndTheirCallsByFirstSourceOccurrence(): void {
	const transcript = parseTranscript(
		[
			assistantWith(bashCall("pwd-1", "pwd")),
			assistantWith(bashCall("ls-1", "ls")),
			line({
				message: {
					content: [toolResult("pwd-1"), toolResult("ls-1")],
				},
				type: "user",
			}),
			assistantWith(bashCall("ls-2", "ls")),
			assistantWith(bashCall("pwd-2", "pwd")),
			line({
				message: {
					content: [toolResult("ls-2"), toolResult("pwd-2")],
				},
				type: "user",
			}),
		].join("\n"),
	);
	const diagnostics = transcriptDiagnostics({
		lines: transcript,
		prefixLinesExcluded: 0,
		sourceAvailable: true,
	});

	expect(diagnostics.state).toBe("complete");
	if (diagnostics.state !== "complete") {
		throw new Error("Expected complete transcript diagnostics");
	}
	expect(
		diagnostics.repeatedBashCommands.map(({ preview, occurrences }) => ({
			lines: occurrences.map(({ location }) => location.line),
			preview,
		})),
	).toEqual([
		{
			lines: [PWD_FIRST_LINE_NUMBER, PWD_REPEAT_LINE_NUMBER],
			preview: "pwd",
		},
		{ lines: [LS_FIRST_LINE_NUMBER, LS_REPEAT_LINE_NUMBER], preview: "ls" },
	]);
}

function boundsThePersistedRepeatedCommandPreview(): void {
	const command = "x".repeat(OVER_LIMIT_PREVIEW_CHARACTERS);
	const transcript = parseTranscript(
		[
			assistantWith(bashCall("bash-1", command)),
			line({
				message: { content: [toolResult("bash-1")] },
				type: "user",
			}),
			assistantWith(bashCall("bash-2", command)),
			line({
				message: { content: [toolResult("bash-2")] },
				type: "user",
			}),
		].join("\n"),
	);

	const diagnostics = transcriptDiagnostics({
		lines: transcript,
		prefixLinesExcluded: 0,
		sourceAvailable: true,
	});

	expect(diagnostics.state).toBe("complete");
	if (diagnostics.state !== "complete") {
		throw new Error("Expected complete transcript diagnostics");
	}
	expect(diagnostics.repeatedBashCommands).toHaveLength(
		EXPECTED_REPEATED_COMMAND_COUNT,
	);
	expect(
		diagnostics.repeatedBashCommands[FIRST_REPEATED_COMMAND_INDEX],
	).toEqual(boundedPreviewExpected);
}

function boundsARepeatedCommandContainingAnUnboundedCombiningSequence(): void {
	const command = `a${"\u0301".repeat(COMBINING_MARK_STRESS_COUNT)}`;
	const transcript = parseTranscript(
		[
			assistantWith(bashCall("bash-1", command)),
			line({
				message: { content: [toolResult("bash-1")] },
				type: "user",
			}),
			assistantWith(bashCall("bash-2", command)),
			line({
				message: { content: [toolResult("bash-2")] },
				type: "user",
			}),
		].join("\n"),
	);
	const diagnostics = transcriptDiagnostics({
		lines: transcript,
		prefixLinesExcluded: 0,
		sourceAvailable: true,
	});

	expect(diagnostics.state).toBe("complete");
	if (diagnostics.state !== "complete") {
		throw new Error("Expected complete transcript diagnostics");
	}
	expect(
		diagnostics.repeatedBashCommands[FIRST_REPEATED_COMMAND_INDEX],
	).toMatchObject({
		commandCharacters: 10_001,
		previewTruncated: true,
	});
	expect(
		diagnostics.repeatedBashCommands[FIRST_REPEATED_COMMAND_INDEX]?.preview,
	).toHaveLength(EXPECTED_PREVIEW_CHARACTERS);
}

describe(transcriptDiagnostics.name, () => {
	it(
		"marks a Bash call without a string command partial",
		marksABashCallWithoutAStringCommandPartial,
	);
	it(
		"orders repeat groups and their calls by first source occurrence",
		ordersRepeatGroupsAndTheirCallsByFirstSourceOccurrence,
	);
	it(
		"bounds the persisted repeated-command preview",
		boundsThePersistedRepeatedCommandPreview,
	);
	it(
		"bounds a repeated command containing an unbounded combining sequence",
		boundsARepeatedCommandContainingAnUnboundedCombiningSequence,
	);
});
