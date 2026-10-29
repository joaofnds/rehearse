import { z } from "zod";

import { unhandled } from "./contracts";
import type { Immutable } from "./contracts";
import { jsonValueSchema } from "./json-value";
import type { JsonValue } from "./json-value";
import { transcriptRecordRole } from "./transcript-message-contract";

const TRANSCRIPT_LINE_NUMBER_BASE = 1;

const EMPTY_COLLECTION_LENGTH = 0;

type HistoryRowReading =
	| { readonly kind: "turn" }
	| { readonly kind: "metadata" }
	| { readonly kind: "attachment"; readonly attachmentKind: string }
	| { readonly kind: "unreadable" };

interface ParsedRow {
	readonly line: number;
	readonly reading: HistoryRowReading;
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
	toolUseResult: z.unknown().optional(),
	type: z.string().optional(),
});

type HistoryRecord = z.infer<typeof historyRecordSchema>;

const readToolResultSchema = z.looseObject({ file: readToolResultFileSchema });

const attachmentKindSchema = z.looseObject({
	attachment: z.looseObject({ type: z.string().nonempty() }),
});

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

const historyThinkingBlockSchema = z.discriminatedUnion("type", [
	z.looseObject({
		thinking: z.string().optional(),
		type: z.literal("thinking"),
	}),
	z.looseObject({ type: z.literal("redacted_thinking") }),
]);

function readHistoryRecord(text: string): HistoryRecord | undefined {
	try {
		return historyRecordSchema.safeParse(JSON.parse(text)).data;
	} catch {
		return undefined;
	}
}

function attachmentReading(value: Immutable<HistoryRecord>): HistoryRowReading {
	const attachment = attachmentKindSchema.safeParse(value);

	return attachment.success
		? { attachmentKind: attachment.data.attachment.type, kind: "attachment" }
		: { kind: "unreadable" };
}

function rowReading(
	value: Immutable<HistoryRecord> | undefined,
): HistoryRowReading {
	if (value === undefined) {
		return { kind: "unreadable" };
	}

	const role = transcriptRecordRole(value);
	switch (role) {
		case "turn": {
			return { kind: "turn" };
		}
		case "metadata": {
			return value.type === "attachment"
				? attachmentReading(value)
				: { kind: "metadata" };
		}
		case "unplaced-message":
		case "untyped": {
			return { kind: "unreadable" };
		}
		default: {
			return unhandled(role, "transcript record role");
		}
	}
}

function parsedRow(text: string, line: number): ParsedRow | undefined {
	if (text.trim() === "") {
		return undefined;
	}

	const value = readHistoryRecord(text);

	return {
		blocks: historyMessageBlocks(value?.message?.content),
		cwd: value?.cwd,
		line,
		reading: rowReading(value),
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
	historyThinkingBlockSchema,
	historyToolCallSchema,
	historyToolResultSchema,
	parsedRows,
	readToolResultSchema,
};

export type { HistoryBlockInput, HistoryRecord, ParsedRow };
