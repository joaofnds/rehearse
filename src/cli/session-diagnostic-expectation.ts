import type { TranscriptDiagnostics } from "#benchmark/transcript-diagnostics-contract";

const expectedTranscriptDiagnostics: TranscriptDiagnostics = {
	issues: [],
	measuredLineCount: 9,
	prefixLinesExcluded: 0,
	repeatedBashCommands: [
		{
			commandCharacters: 2,
			commandSha256:
				"c7b68ac37f364473e922936708e7f43c293dd07b295171566c07ff5fe024fab9",
			occurrences: [
				{ location: { block: 1, line: 1 }, toolUseId: "bash-1" },
				{ location: { block: 1, line: 5 }, toolUseId: "bash-2" },
			],
			preview: "ls",
			previewTruncated: false,
		},
	],
	sourceLineCount: 9,
	state: "complete",
	toolErrors: [
		{
			call: { block: 1, line: 5 },
			result: { block: 1, line: 6 },
			toolName: "Bash",
			toolUseId: "bash-2",
		},
	],
	toolUseOccurrences: {
		byName: [
			{ count: 3, name: "Bash" },
			{ count: 1, name: "Read" },
		],
		total: 4,
	},
};

export { expectedTranscriptDiagnostics as default };
