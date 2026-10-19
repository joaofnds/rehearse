import type { z } from "zod";

import type { repeatedBashCommandSchema } from "./transcript-diagnostic-shapes";
import type { TranscriptDiagnostics } from "./transcript-diagnostics-contract";

const PREVIEW_BOUNDARY_CHARACTERS = 160;

const measuredDiagnosticsExpected: TranscriptDiagnostics = {
	issues: [],
	measuredLineCount: 8,
	prefixLinesExcluded: 2,
	repeatedBashCommands: [
		{
			commandCharacters: 2,
			commandSha256:
				"c7b68ac37f364473e922936708e7f43c293dd07b295171566c07ff5fe024fab9",
			occurrences: [
				{ location: { block: 1, line: 3 }, toolUseId: "bash-1" },
				{ location: { block: 1, line: 7 }, toolUseId: "bash-2" },
			],
			preview: "ls",
			previewTruncated: false,
		},
	],
	sourceLineCount: 10,
	state: "complete",
	toolErrors: [
		{
			call: { block: 1, line: 7 },
			result: { block: 1, line: 8 },
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

const missingBashCommandExpected: TranscriptDiagnostics = {
	issues: [
		{
			kind: "invalid-bash-command",
			locations: [{ block: 1, line: 1 }],
			locationsTruncated: false,
			occurrences: 1,
		},
	],
	measuredLineCount: 2,
	prefixLinesExcluded: 0,
	repeatedBashCommands: [],
	sourceLineCount: 2,
	state: "partial",
	toolErrors: [],
	toolUseOccurrences: {
		byName: [{ count: 1, name: "Bash" }],
		total: 1,
	},
};

const boundedPreviewExpected: z.infer<typeof repeatedBashCommandSchema> = {
	commandCharacters: 161,
	commandSha256:
		"fdb7f3c40645e79ca4c5d1638753243ccb283f5dd126ceb21de5fa7d40953c65",
	occurrences: [
		{ location: { block: 1, line: 1 }, toolUseId: "bash-1" },
		{ location: { block: 1, line: 3 }, toolUseId: "bash-2" },
	],
	preview: "x".repeat(PREVIEW_BOUNDARY_CHARACTERS),
	previewTruncated: true,
};

export {
	measuredDiagnosticsExpected,
	missingBashCommandExpected,
	boundedPreviewExpected,
};
