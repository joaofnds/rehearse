import type { JsonValue } from "#benchmark/json-value";

const FINAL_FIXTURE_IDENTIFIER_CHARACTER_OFFSET = -1;

const SINGLE_LINE_SAMPLE_COUNT = 1;

const FIRST_TRANSCRIPT_LINE_NUMBER = 1;

function row(record: JsonValue): string {
	return JSON.stringify(record);
}

function call(
	id: string,
	name: string,
	input: Readonly<Record<string, JsonValue>>,
): JsonValue {
	return {
		cwd: "/work",
		message: {
			content: [{ id, input, name, type: "tool_use" }],
		},
		timestamp: `2026-09-14T00:00:0${id.at(FINAL_FIXTURE_IDENTIFIER_CHARACTER_OFFSET) ?? "0"}.000Z`,
		type: "assistant",
	};
}

function result(
	id: string,
	content: string,
	options: {
		readonly error?: boolean;
		readonly snapshot?: string;
		readonly startLine?: number;
		readonly numLines?: number;
		readonly totalLines?: number;
	} = {},
): JsonValue {
	const base = {
		cwd: "/work",
		message: {
			content: [
				{
					content,
					is_error: options.error ?? false,
					tool_use_id: id,
					type: "tool_result",
				},
			],
		},
		type: "user",
	} satisfies JsonValue;
	if (options.snapshot === undefined) {
		return base;
	}

	return {
		...base,
		toolUseResult: {
			file: {
				content: options.snapshot,
				filePath: "/work/CLAUDE.md",
				numLines: options.numLines ?? SINGLE_LINE_SAMPLE_COUNT,
				startLine: options.startLine ?? FIRST_TRANSCRIPT_LINE_NUMBER,
				totalLines: options.totalLines ?? SINGLE_LINE_SAMPLE_COUNT,
			},
			type: "text",
		},
	};
}

interface HistoryToolUse {
	readonly id: string;
	readonly name: string;
	readonly input: Readonly<Record<string, JsonValue>>;
}

function callIn(
	cwd: string | undefined,
	{ id, name, input }: HistoryToolUse,
): JsonValue {
	const base = {
		message: { content: [{ id, input, name, type: "tool_use" }] },
		timestamp: "2026-09-14T00:00:00.000Z",
		type: "assistant",
	} satisfies JsonValue;

	return cwd === undefined ? base : { ...base, cwd };
}

function resultIn(
	cwd: string | undefined,
	id: string,
	content: string,
): JsonValue {
	const base = {
		message: {
			content: [
				{ content, is_error: false, tool_use_id: id, type: "tool_result" },
			],
		},
		type: "user",
	} satisfies JsonValue;

	return cwd === undefined ? base : { ...base, cwd };
}

export { row, call, result, callIn, resultIn };

export type { HistoryToolUse };
