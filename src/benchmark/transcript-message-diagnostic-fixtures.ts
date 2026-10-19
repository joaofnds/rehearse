import type { TranscriptDiagnostics } from "./transcript-diagnostics-contract";

const invalidAssistantExpected: TranscriptDiagnostics = {
	issues: [
		{
			kind: "invalid-message-content",
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
	toolUseOccurrences: { byName: [], total: 0 },
};

const unknownRecordExpected: TranscriptDiagnostics = {
	issues: [
		{
			kind: "invalid-message-content",
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
	toolUseOccurrences: { byName: [], total: 0 },
};

const partialMalformedExpected: TranscriptDiagnostics = {
	issues: [
		{
			kind: "invalid-json",
			locations: [{ block: 1, line: 1 }],
			locationsTruncated: false,
			occurrences: 1,
		},
	],
	measuredLineCount: 3,
	prefixLinesExcluded: 0,
	repeatedBashCommands: [],
	sourceLineCount: 3,
	state: "partial",
	toolErrors: [],
	toolUseOccurrences: {
		byName: [{ count: 1, name: "Bash" }],
		total: 1,
	},
};

export {
	invalidAssistantExpected,
	unknownRecordExpected,
	partialMalformedExpected,
};
