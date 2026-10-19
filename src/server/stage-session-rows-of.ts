import { stripVTControlCharacters } from "node:util";

import { z } from "zod";

import parseJsonDocument from "#benchmark/json-document";
import type {
	SessionLine,
	TranscriptBlock,
} from "#server/stage-session-contract";

const FIRST_PREVIEW_LINE_INDEX = 0;

const PREVIEW_LINE_COUNT = 1;

const PREFIX_START_INDEX = 0;

const toolResultPartSchema = z.looseObject({ text: z.string().optional() });

const MAX_TEXT_LENGTH = 1000;

/** The text a terminal shows, without control sequences or surrounding whitespace. */
function visible(text: string): string {
	return stripVTControlCharacters(text).trim();
}

function firstLine(text: string): string {
	return (
		visible(text).split("\n", PREVIEW_LINE_COUNT)[FIRST_PREVIEW_LINE_INDEX] ??
		""
	);
}

const toolUseBlockSchema = z
	.looseObject({
		input: z.looseObject({
			command: z.string().optional(),
			description: z.string().optional(),
			file_path: z.string().optional(),
			pattern: z.string().optional(),
			url: z.string().optional(),
		}),
		name: z.string(),
		type: z.literal("tool_use"),
	})
	.transform(({ name, input }): TranscriptBlock => {
		const target =
			input.file_path ??
			input.command ??
			input.pattern ??
			input.url ??
			input.description;

		return {
			kind: "tool",
			text: target === undefined ? name : `${name}  ${firstLine(target)}`,
		};
	});

const toolResultBlockSchema = z
	.looseObject({
		content: z
			.union([
				z.string(),
				z
					.array(toolResultPartSchema)
					.transform(
						(parts) => parts.find(({ text }) => text !== undefined)?.text,
					),
			])
			.optional(),
		type: z.literal("tool_result"),
	})
	.transform(({ content }): TranscriptBlock => ({
		kind: "result",
		text: firstLine(content ?? ""),
	}));

const textBlockSchema = z
	.looseObject({ text: z.string(), type: z.literal("text") })
	.transform(({ text }): TranscriptBlock => ({
		kind: "text",
		text: visible(text),
	}));

const otherBlockSchema = z
	.unknown()
	.transform((): TranscriptBlock => ({ kind: "other" }));

const messageContentSchema = z.union([
	z
		.string()
		.transform((text): TranscriptBlock[] => [
			{ kind: "text", text: visible(text) },
		]),
	z.array(
		z.union([
			toolUseBlockSchema,
			toolResultBlockSchema,
			textBlockSchema,
			otherBlockSchema,
		]),
	),
]);

const transcriptRecordSchema = z.looseObject({
	isMeta: z.boolean().optional(),
	message: z.looseObject({ content: messageContentSchema }).optional(),
	type: z.string(),
});

function shortened(text: string): string {
	return text.length > MAX_TEXT_LENGTH
		? `${text.slice(PREFIX_START_INDEX, MAX_TEXT_LENGTH)}…`
		: text;
}

function rowOf(
	block: TranscriptBlock,
	line: number,
	textKind: "user" | "assistant",
): SessionLine | undefined {
	if (block.kind === "other") {
		return undefined;
	}

	if (block.text === "") {
		return undefined;
	}

	return {
		kind: block.kind === "text" ? textKind : block.kind,
		line,
		text: shortened(block.text),
	};
}

/**
 * The rows one transcript line shows. Only the conversation reads as rows:
 * a skill body or other record the provider marks as meta, and every record
 * that is not a user or assistant message, shows nothing.
 */
function rowsOf(text: string, line: number): readonly SessionLine[] {
	const documentReading = parseJsonDocument(text, transcriptRecordSchema);
	if (documentReading.kind === "invalid-json") {
		return [];
	}
	const { parsed: record } = documentReading;
	if (
		!record.success ||
		record.data.isMeta === true ||
		record.data.message === undefined ||
		(record.data.type !== "user" && record.data.type !== "assistant")
	) {
		return [];
	}

	const textKind = record.data.type;

	return record.data.message.content.flatMap(
		(block) => rowOf(block, line, textKind) ?? [],
	);
}

export { rowsOf as default };
