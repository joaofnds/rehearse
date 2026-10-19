import { z } from "zod";

import { jsonObjectSchema, jsonValueSchema } from "./json-value";
import type { JsonObject, JsonValue } from "./json-value";

const stringSchema = z.string();

const numberSchema = z.number();

const nullableStringSchema = z.string().nullable();

const jsonArraySchema = z.array(jsonValueSchema);

const coverageStateSchema = z.enum(["complete", "partial", "unavailable"]);

const subagentStopSchema = z
	.object({
		agent_id: z.string().nonempty(),
		agent_transcript_path: z.string().nonempty(),
		capture_ordinal: z.number().int().nonnegative(),
		hook_event_name: z.literal("SubagentStop"),
	})
	.loose();

const instructionLoadHookSchema = z
	.object({
		agent_id: z.string().nonempty().optional(),
		capture_ordinal: z.number().int().nonnegative(),
		file_path: z.string().nonempty(),
		globs: z.array(z.string()).optional(),
		hook_event_name: z.literal("InstructionsLoaded"),
		load_reason: z.string().nonempty(),
		memory_type: z.string().nonempty(),
		parent_file_path: z.string().nonempty().optional(),
		prompt_id: z.string().nonempty().nullable().optional(),
		trigger_file_path: z.string().nonempty().optional(),
	})
	.loose();

const compactionHookSchema = z
	.object({
		agent_id: z.string().nonempty().optional(),
		capture_ordinal: z.number().int().nonnegative(),
		compact_summary: z.string().optional(),
		hook_event_name: z.enum(["PreCompact", "PostCompact"]),
		prompt_id: z.string().nonempty().nullable().optional(),
		trigger: z.string().nonempty(),
	})
	.loose();

const rawBodyRecordSchema = z
	.object({
		body_ref: z.string().nonempty(),
		capture_ordinal: z.number().int().nonnegative(),
	})
	.loose();

const coverageRecordSchema = z
	.object({
		reason: z.string().nonempty().optional(),
		state: coverageStateSchema,
		stream: z.string().nonempty(),
	})
	.loose();

function asObject(value: JsonValue): JsonObject | undefined {
	const parsed = jsonObjectSchema.safeParse(value);

	return parsed.success ? parsed.data : undefined;
}

function objectValue(
	record: Readonly<JsonObject>,
	key: string,
): JsonObject | undefined {
	return asObject(record[key] ?? null);
}

function stringValue(
	record: Readonly<JsonObject>,
	key: string,
): string | undefined {
	const parsed = stringSchema.safeParse(record[key]);

	return parsed.success ? parsed.data : undefined;
}

function numberValue(
	record: Readonly<JsonObject>,
	key: string,
): number | undefined {
	const parsed = numberSchema.safeParse(record[key]);

	return parsed.success ? parsed.data : undefined;
}

function nullableStringValue(
	record: Readonly<JsonObject>,
	key: string,
): string | null | undefined {
	const parsed = nullableStringSchema.safeParse(record[key]);

	return parsed.success ? parsed.data : undefined;
}

function arrayValue(
	record: Readonly<JsonObject>,
	key: string,
): readonly JsonValue[] {
	const parsed = jsonArraySchema.safeParse(record[key]);

	return parsed.success ? parsed.data : [];
}

function canonicalJson(value: JsonValue): string {
	const array = jsonArraySchema.safeParse(value);
	if (array.success) {
		return `[${array.data.map((entry) => canonicalJson(entry)).join(",")}]`;
	}
	const object = jsonObjectSchema.safeParse(value);
	if (object.success) {
		return `{${Object.entries(object.data)
			.toSorted(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
			.join(",")}}`;
	}

	return JSON.stringify(value) ?? "null";
}

export {
	numberValue,
	objectValue,
	arrayValue,
	asObject,
	stringValue,
	subagentStopSchema,
	nullableStringValue,
	canonicalJson,
	instructionLoadHookSchema,
	compactionHookSchema,
	rawBodyRecordSchema,
	coverageRecordSchema,
};
