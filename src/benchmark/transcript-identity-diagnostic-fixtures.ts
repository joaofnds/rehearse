import type { TranscriptDiagnostics } from "./transcript-diagnostics-contract";

const ambiguousIdentitiesExpected: TranscriptDiagnostics = {
	issues: [
		{
			kind: "duplicate-tool-use-id",
			locations: [
				{ block: 1, line: 1 },
				{ block: 2, line: 1 },
			],
			locationsTruncated: false,
			occurrences: 2,
		},
		{
			kind: "unmatched-tool-result",
			locations: [{ block: 2, line: 2 }],
			locationsTruncated: false,
			occurrences: 1,
		},
	],
	measuredLineCount: 2,
	prefixLinesExcluded: 0,
	repeatedBashCommands: [],
	sourceLineCount: 2,
	state: "partial",
	toolErrors: [
		{
			result: { block: 1, line: 2 },
			toolUseId: "duplicate",
		},
		{
			result: { block: 2, line: 2 },
			toolUseId: "unmatched",
		},
	],
	toolUseOccurrences: {
		byName: [{ count: 2, name: "Bash" }],
		total: 2,
	},
};

const missingIdentitiesExpected: TranscriptDiagnostics = {
	issues: [
		{
			kind: "missing-tool-use-id",
			locations: [
				{ block: 1, line: 1 },
				{ block: 2, line: 1 },
			],
			locationsTruncated: false,
			occurrences: 2,
		},
		{
			kind: "missing-tool-result-id",
			locations: [{ block: 1, line: 2 }],
			locationsTruncated: false,
			occurrences: 1,
		},
	],
	measuredLineCount: 2,
	prefixLinesExcluded: 0,
	repeatedBashCommands: [],
	sourceLineCount: 2,
	state: "partial",
	toolErrors: [{ result: { block: 1, line: 2 } }],
	toolUseOccurrences: {
		byName: [{ count: 2, name: "Bash" }],
		total: 2,
	},
};

const invalidToolsExpected: TranscriptDiagnostics = {
	issues: [
		{
			kind: "invalid-tool-use",
			locations: [{ block: 1, line: 1 }],
			locationsTruncated: false,
			occurrences: 1,
		},
		{
			kind: "invalid-tool-result",
			locations: [{ block: 1, line: 2 }],
			locationsTruncated: false,
			occurrences: 1,
		},
		{
			kind: "duplicate-tool-result",
			locations: [
				{ block: 1, line: 4 },
				{ block: 2, line: 4 },
			],
			locationsTruncated: false,
			occurrences: 2,
		},
	],
	measuredLineCount: 4,
	prefixLinesExcluded: 0,
	repeatedBashCommands: [],
	sourceLineCount: 4,
	state: "partial",
	toolErrors: [],
	toolUseOccurrences: {
		byName: [{ count: 1, name: "Read" }],
		total: 1,
	},
};

export {
	ambiguousIdentitiesExpected,
	missingIdentitiesExpected,
	invalidToolsExpected,
};
