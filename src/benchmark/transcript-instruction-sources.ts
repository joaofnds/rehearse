import type { JsonValue } from "./json-value";
import { instructionsAttachmentSchema } from "./transcript-instruction-loads";
import {
	attachmentRecordSchema,
	namedAgentRecordSchema,
	outputStyleAttachmentSchema,
	textBlockSchema,
} from "./transcript-message-contract";

/**
 * The provider opens a loaded skill's body with this line, in a user record it
 * marks as meta, whether a slash command or a Skill call loaded it, and a Skill
 * call it refuses gets no body, so this line rather than the call is the
 * evidence the skill loaded.
 */
const SKILL_BODY_OPENING =
	/^Base directory for this skill: (?<directory>[^\n]+)/u;

/** The skill directory a loaded skill's body opens with, if the text is one. */
function skillBodyDirectory(text: string): string | undefined {
	return SKILL_BODY_OPENING.exec(text)?.groups?.["directory"];
}

function readNamedAgent(record: JsonValue): string | undefined {
	const named = namedAgentRecordSchema.safeParse(record);

	return named.success ? named.data.toolUseResult.agentId : undefined;
}

function readOutputStyle(record: JsonValue): string | undefined {
	const attachmentRecord = attachmentRecordSchema.safeParse(record);
	if (!attachmentRecord.success) {
		return undefined;
	}

	const outputStyle = outputStyleAttachmentSchema.safeParse(
		attachmentRecord.data.attachment,
	);

	return outputStyle.success ? outputStyle.data.style : undefined;
}

function readSkillDirectories(blocks: readonly unknown[]): readonly string[] {
	return blocks
		.map((block) => textBlockSchema.safeParse(block))
		.filter((parsed) => parsed.success)
		.map((parsed) => skillBodyDirectory(parsed.data.text))
		.filter((directory) => directory !== undefined);
}

function readInstructionFiles(record: JsonValue): readonly string[] {
	const instructions = instructionsAttachmentSchema.safeParse(record);

	return instructions.success
		? instructions.data.attachment.files.map((file) => file.path)
		: [];
}

export {
	skillBodyDirectory,
	readInstructionFiles,
	readNamedAgent,
	readOutputStyle,
	readSkillDirectories,
};
