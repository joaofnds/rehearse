import type { Immutable } from "./contracts";
import type { LineObserver } from "./file-lines";
import { fileLines } from "./file-lines";
import readLine from "./transcript-line";
import type { TranscriptLine } from "./transcript-line-contract";
import type { ToolUse } from "./transcript-message-contract";

const TRANSCRIPT_LINE_NUMBER_BASE = 1;

const TRANSCRIPT_LINE_NUMBER_STEP = 1;

function parseTranscript(text: string): readonly TranscriptLine[] {
	return text
		.split("\n")
		.map((line, index) => ({
			line,
			lineNumber: index + TRANSCRIPT_LINE_NUMBER_BASE,
		}))
		.filter(({ line }) => line.trim() !== "")
		.map(({ line, lineNumber }) => readLine(line, lineNumber));
}

/**
 * Transcripts run to several megabytes, and ACT-25's resumed cases carry real
 * ones, so a transcript on disk is read one line at a time rather than held as
 * a string. A transcript the provider never wrote reads as no records, which is
 * the same thing an empty one reads as.
 */
async function parseTranscriptFile(
	path: string,
	observer?: LineObserver,
): Promise<readonly TranscriptLine[]> {
	if (!(await Bun.file(path).exists())) {
		return [];
	}

	const lines: TranscriptLine[] = [];
	let lineNumber = 0;
	for await (const line of fileLines(path, observer)) {
		lineNumber += TRANSCRIPT_LINE_NUMBER_STEP;
		if (line.trim() !== "") {
			lines.push(readLine(line, lineNumber));
		}
	}

	return lines;
}

function toolUses(
	lines: Immutable<readonly TranscriptLine[]>,
): readonly ToolUse[] {
	return lines.flatMap((line) => [...line.toolUses]);
}

function toolUsesExceptFailed(
	lines: Immutable<readonly TranscriptLine[]>,
): readonly ToolUse[] {
	const failed = new Set(
		lines
			.flatMap((line) => [...line.locatedToolResults])
			.filter((result) => result.isError)
			.map((result) => result.toolUseId)
			.filter((id) => id !== undefined),
	);

	return toolUses(lines).filter(
		(use) => use.id === undefined || !failed.has(use.id),
	);
}

function filesRead(uses: Immutable<readonly ToolUse[]>): readonly string[] {
	return uses
		.filter((use) => use.name === "Read")
		.map((use) => use.input.file_path)
		.filter((path) => path !== undefined);
}

function outputStyles(
	lines: Immutable<readonly TranscriptLine[]>,
): readonly string[] {
	return lines
		.map((line) => line.outputStyle)
		.filter((style) => style !== undefined);
}

function instructionFiles(
	lines: Immutable<readonly TranscriptLine[]>,
): readonly string[] {
	return lines.flatMap((line) => [...line.instructionFiles]);
}

function skillDirectories(
	lines: Immutable<readonly TranscriptLine[]>,
): readonly string[] {
	return lines.flatMap((line) => [...line.skillDirectories]);
}

export { skillBodyDirectory } from "./transcript-instruction-sources";

export {
	transcriptLocationSchema,
	transcriptDiagnosticsSchema,
} from "./transcript-diagnostics-contract";

export { default as transcriptDiagnostics } from "./transcript-diagnostics";

export type { UserTurn, TranscriptLine } from "./transcript-line-contract";

export type { ToolUse } from "./transcript-message-contract";

export type {
	TranscriptLocation,
	TranscriptDiagnostics,
} from "./transcript-diagnostics-contract";

export type { TranscriptDiagnosticsInput } from "./transcript-diagnostics";

export {
	parseTranscript,
	parseTranscriptFile,
	toolUses,
	toolUsesExceptFailed,
	filesRead,
	outputStyles,
	instructionFiles,
	skillDirectories,
};
