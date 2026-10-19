import { z } from "zod";

import { jsonValueSchema } from "./json-value";
import type { JsonValue } from "./json-value";

const TRANSCRIPT_LINE_NUMBER_BASE = 1;

const EMPTY_COLLECTION_LENGTH = 0;

interface ParsedRow {
	readonly line: number;
	readonly timestamp: string | undefined;
	readonly cwd: string | undefined;
	readonly value: HistoryRecord | undefined;
	readonly blocks: readonly JsonValue[];
}

const historyContentSchema = z.union([z.string(), z.array(jsonValueSchema)]);

const readToolResultFileSchema = z
	.looseObject({
		content: z.string(),
		filePath: z.string().optional(),
		numLines: z.number().int().nonnegative().optional(),
		startLine: z.number().int().positive().optional(),
		totalLines: z.number().int().nonnegative().optional(),
	})
	.optional();

const historyRecordSchema = z.looseObject({
	cwd: z.string().nonempty().optional(),
	isMeta: z.boolean().optional(),
	message: z.looseObject({ content: historyContentSchema }).optional(),
	sourceToolUseID: z.string().nonempty().optional(),
	timestamp: z.string().nonempty().optional(),
	toolUseResult: z
		.looseObject({
			file: readToolResultFileSchema,
		})
		.optional(),
	type: z.string().optional(),
});

type HistoryRecord = z.infer<typeof historyRecordSchema>;

const historyBlockInputSchema = z.record(z.string(), jsonValueSchema);

type HistoryBlockInput = z.infer<typeof historyBlockInputSchema>;

const historyToolCallSchema = z.looseObject({
	id: z.string().nonempty().optional(),
	input: historyBlockInputSchema.optional().default({}),
	name: z.string().nonempty(),
	type: z.literal("tool_use"),
});

const historyToolResultSchema = z.looseObject({
	content: jsonValueSchema.optional(),
	is_error: z.boolean().optional(),
	tool_use_id: z.string().nonempty().optional(),
	type: z.literal("tool_result"),
});

const historyTextBlockSchema = z.looseObject({
	text: z.string(),
	type: z.literal("text"),
});

function readHistoryRecord(text: string): HistoryRecord | undefined {
	try {
		return historyRecordSchema.safeParse(JSON.parse(text)).data;
	} catch {
		return undefined;
	}
}

function parsedRow(text: string, line: number): ParsedRow | undefined {
	if (text.trim() === "") {
		return undefined;
	}

	const value = readHistoryRecord(text);
	const content = value?.message?.content;

	return {
		blocks: historyMessageBlocks(content),
		cwd: value?.cwd,
		line,
		timestamp: value?.timestamp,
		value,
	};
}

function parsedRows(transcript: string): readonly ParsedRow[] {
	return transcript
		.split("\n")
		.flatMap(
			(text, index) =>
				parsedRow(text, index + TRANSCRIPT_LINE_NUMBER_BASE) ?? [],
		);
}

function historyMessageBlocks(
	content: JsonValue | undefined,
): readonly JsonValue[] {
	const list = z.array(jsonValueSchema).safeParse(content);
	if (list.success) {
		return list.data.length === EMPTY_COLLECTION_LENGTH ? [null] : list.data;
	}
	const string = z.string().safeParse(content);
	return string.success ? [string.data] : [null];
}

export {
	parsedRow,
	historyTextBlockSchema,
	historyToolCallSchema,
	historyToolResultSchema,
	parsedRows,
};

export type { HistoryBlockInput, HistoryRecord, ParsedRow };
