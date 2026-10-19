import { describe, expect, it } from "bun:test";

import { instructionFiles, parseTranscript } from "#benchmark/transcript";

import { attachmentLine } from "./transcript-test-fixtures";

function returnsThePathOfEveryFileAnInstructionsAttachmentNames(): void {
	const transcript = parseTranscript(
		attachmentLine({
			files: [
				{ path: "/tmp/attempt/.claude/CLAUDE.md", type: "Project" },
				{ path: "/tmp/attempt/CLAUDE.md", type: "Project" },
			],
			type: "instructions",
		}),
	);

	expect(instructionFiles(transcript)).toEqual([
		"/tmp/attempt/.claude/CLAUDE.md",
		"/tmp/attempt/CLAUDE.md",
	]);
}

function returnsNothingForATranscriptWithNoInstructionsAttachment(): void {
	const files = instructionFiles(
		parseTranscript(attachmentLine({ type: "budget_usd" })),
	);
	expect(files).toEqual([]);
}

describe(instructionFiles.name, () => {
	it(
		"returns the path of every file an instructions attachment names",
		returnsThePathOfEveryFileAnInstructionsAttachmentNames,
	);
	it(
		"returns nothing for a transcript with no instructions attachment",
		returnsNothingForATranscriptWithNoInstructionsAttachment,
	);
});
