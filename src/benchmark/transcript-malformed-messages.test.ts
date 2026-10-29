import { describe, expect, it } from "bun:test";

import { parseTranscript, transcriptDiagnostics } from "#benchmark/transcript";

import {
	invalidAssistantExpected,
	partialMalformedExpected,
	unknownRecordExpected,
} from "./transcript-message-diagnostic-fixtures";
import {
	assistantWith,
	bashCall,
	line,
	toolResult,
} from "./transcript-test-fixtures";

function treatsStringValuedAssistantContentAsMalformedEvidence(): void {
	const transcript = parseTranscript(
		line({ message: { content: "not block content" }, type: "assistant" }),
	);

	expect(
		transcriptDiagnostics({
			lines: transcript,
			prefixLinesExcluded: 0,
			sourceAvailable: true,
		}),
	).toEqual(invalidAssistantExpected);
}

function rejectsToolContentFromUnknownRecords(): void {
	const transcript = parseTranscript(
		line({
			message: { content: [bashCall("bash-1", "pwd")] },
			type: "future-assistant",
		}),
	);

	expect(
		transcriptDiagnostics({
			lines: transcript,
			prefixLinesExcluded: 0,
			sourceAvailable: true,
		}),
	).toEqual(unknownRecordExpected);
}

function readsARequestBlobAsMetadata(): void {
	const transcript = parseTranscript(
		[
			assistantWith(bashCall("bash-1", "pwd")),
			line({
				message: { content: [toolResult("bash-1")] },
				type: "user",
			}),
			line({
				message: { content: [bashCall("bash-1", "pwd")] },
				type: "api-request-blob",
			}),
		].join("\n"),
	);

	expect(
		transcriptDiagnostics({
			lines: transcript,
			prefixLinesExcluded: 0,
			sourceAvailable: true,
		}).state,
	).toBe("complete");
}

function marksMalformedOrEmptyMeasuredEvidencePartialWithoutHidingRawCounts(): void {
	const malformed = parseTranscript(
		[
			"not json",
			assistantWith(bashCall("bash-1", "pwd")),
			line({
				message: { content: [toolResult("bash-1")] },
				type: "user",
			}),
		].join("\n"),
	);

	expect(
		transcriptDiagnostics({
			lines: malformed,
			prefixLinesExcluded: 0,
			sourceAvailable: true,
		}),
	).toEqual(partialMalformedExpected);

	expect(
		transcriptDiagnostics({
			lines: [],
			prefixLinesExcluded: 3,
			sourceAvailable: true,
		}),
	).toEqual({
		issues: [
			{
				kind: "empty-measured-transcript",
				locations: [{ block: 1, line: 4 }],
				locationsTruncated: false,
				occurrences: 1,
			},
		],
		measuredLineCount: 0,
		prefixLinesExcluded: 3,
		repeatedBashCommands: [],
		sourceLineCount: 0,
		state: "partial",
		toolErrors: [],
		toolUseOccurrences: { byName: [], total: 0 },
	});
}

function marksAnUnsupportedToolBearingBlockAndAMissingResultPartial(): void {
	const transcript = parseTranscript(
		assistantWith(bashCall("bash-1", "pwd"), {
			input: {},
			name: "future-tool",
			type: "server_tool_use",
		}),
	);

	expect(
		transcriptDiagnostics({
			lines: transcript,
			prefixLinesExcluded: 0,
			sourceAvailable: true,
		}),
	).toEqual({
		issues: [
			{
				kind: "unsupported-content-block",
				locations: [{ block: 2, line: 1 }],
				locationsTruncated: false,
				occurrences: 1,
			},
			{
				kind: "missing-tool-result",
				locations: [{ block: 1, line: 1 }],
				locationsTruncated: false,
				occurrences: 1,
			},
		],
		measuredLineCount: 1,
		prefixLinesExcluded: 0,
		repeatedBashCommands: [],
		sourceLineCount: 1,
		state: "partial",
		toolErrors: [],
		toolUseOccurrences: {
			byName: [{ count: 1, name: "Bash" }],
			total: 1,
		},
	});
}

describe(transcriptDiagnostics.name, () => {
	it(
		"treats string-valued assistant content as malformed evidence",
		treatsStringValuedAssistantContentAsMalformedEvidence,
	);
	it(
		"does not accept tool-shaped message content from an unknown record kind",
		rejectsToolContentFromUnknownRecords,
	);
	it("reads a request blob as metadata", readsARequestBlobAsMetadata);
	it(
		"marks malformed or empty measured evidence partial without hiding raw counts",
		marksMalformedOrEmptyMeasuredEvidencePartialWithoutHidingRawCounts,
	);
	it(
		"marks an unsupported tool-bearing block and a missing result partial",
		marksAnUnsupportedToolBearingBlockAndAMissingResultPartial,
	);
});
