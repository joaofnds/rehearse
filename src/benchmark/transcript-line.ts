import type { JsonValue } from "./json-value";
import { jsonValueSchema } from "./json-value";
import LocatedContentBlocks from "./transcript-content-blocks";
import {
	readInstructionFiles,
	readNamedAgent,
	readOutputStyle,
	readSkillDirectories,
} from "./transcript-instruction-sources";
import type {
	LocatedDiagnosticIssue,
	TranscriptLine,
} from "./transcript-line-contract";
import readMessage from "./transcript-message";
import { metaRecordSchema } from "./transcript-message-contract";
import readUserFields from "./transcript-user-turn";

const TRANSCRIPT_BLOCK_NUMBER_BASE = 1;

function readLine(line: string, lineNumber: number): TranscriptLine {
	const parsed = readJson(line);
	if (parsed === undefined) {
		return emptyTranscriptLine(lineNumber, "invalid-json");
	}
	const message = readMessage(parsed);
	if (message === undefined) {
		return emptyTranscriptLine(lineNumber, "invalid-message-content");
	}
	const content = new LocatedContentBlocks();
	for (const [index, block] of message.blocks.entries()) {
		content.observe({
			location: {
				block: index + TRANSCRIPT_BLOCK_NUMBER_BASE,
				line: lineNumber,
			},
			value: block,
		});
	}
	return {
		diagnosticIssues: content.diagnosticIssues,
		instructionFiles: readInstructionFiles(parsed),
		line: lineNumber,
		locatedToolResults: content.locatedToolResults,
		locatedToolUses: content.locatedToolUses,
		namedAgent: readNamedAgent(parsed),
		outputStyle: readOutputStyle(parsed),
		skillDirectories:
			message.type === "user" && metaRecordSchema.safeParse(parsed).success
				? readSkillDirectories(message.blocks)
				: [],
		toolUses: content.locatedToolUses.map(({ use }) => use),
		...readUserFields(message.user, message.blocks),
		requestId: message.requestId,
	};
}

function emptyTranscriptLine(
	line: number,
	kind: LocatedDiagnosticIssue["kind"],
): TranscriptLine {
	return {
		diagnosticIssues: [{ kind, location: { block: 1, line } }],
		instructionFiles: [],
		line,
		locatedToolResults: [],
		locatedToolUses: [],
		namedAgent: undefined,
		outputStyle: undefined,
		requestId: undefined,
		skillDirectories: [],
		sourceToolUseId: undefined,
		startsWithoutParent: false,
		toolUses: [],
		userTurn: undefined,
	};
}

function readJson(line: string): JsonValue | undefined {
	try {
		const parsed = jsonValueSchema.safeParse(JSON.parse(line));

		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}

export { readLine as default };
