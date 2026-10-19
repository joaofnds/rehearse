import { z } from "zod";

import type { JsonObject, JsonValue } from "./json-value";

const DEFAULT_JSON_INDENT_SPACES = 2;
const jsonObjectNodeSchema = z.looseObject({});
const jsonValueNodeSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
	z.array(z.unknown()),
	jsonObjectNodeSchema,
]);

// JSON.parse owns the value kinds. Inspect original containers so validation
// preserves __proto__ ownership and supports deeply nested historical records.
const ownedJsonValueSchema = z.custom<JsonValue>(
	(value) => jsonValueNodeSchema.safeParse(value).success,
);
const ownedJsonObjectSchema = z.custom<Readonly<JsonObject>>(
	(value) => jsonObjectNodeSchema.safeParse(value).success,
);

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
	return Array.isArray(value);
}

function jsonChildren(value: JsonValue): readonly JsonValue[] {
	if (isJsonArray(value)) {
		return value;
	}
	const object = ownedJsonObjectSchema.safeParse(value);
	return object.success ? Object.values(object.data) : [];
}

function parseOwnedJson(json: string): JsonValue {
	const value = ownedJsonValueSchema.parse(JSON.parse(json));
	const pending = [...jsonChildren(value)];
	let candidate = pending.pop();
	while (candidate !== undefined) {
		const node = ownedJsonValueSchema.parse(candidate);
		for (const child of jsonChildren(node)) {
			pending.push(child);
		}
		candidate = pending.pop();
	}
	return value;
}

interface JsonFieldOrder {
	readonly children?: Readonly<Record<string, JsonFieldOrder>>;
	readonly fields: readonly string[];
	readonly values?: JsonFieldOrder;
}

interface JsonOrderingTask {
	readonly order: JsonFieldOrder;
	readonly replace: (value: JsonValue) => void;
	readonly value: JsonValue;
}

type ScheduleJsonOrdering = (task: JsonOrderingTask) => void;

function childOrder(
	order: JsonFieldOrder,
	field: string,
): JsonFieldOrder | undefined {
	return order.children !== undefined && Object.hasOwn(order.children, field)
		? order.children[field]
		: order.values;
}

function orderedEntries(
	object: Readonly<JsonObject>,
	order: JsonFieldOrder,
): [string, JsonValue][] {
	const fields = new Set([...order.fields, ...Object.keys(object)]);
	const entries: [string, JsonValue][] = [];
	for (const field of fields) {
		const value = object[field];
		if (Object.hasOwn(object, field) && value !== undefined) {
			entries.push([field, value]);
		}
	}
	return entries;
}

function orderArray(
	task: JsonOrderingTask,
	values: readonly JsonValue[],
	schedule: ScheduleJsonOrdering,
): void {
	const ordered = [...values];
	task.replace(ordered);
	for (const [index, value] of values.entries()) {
		schedule({
			order: task.order,
			replace(result) {
				ordered[index] = result;
			},
			value,
		});
	}
}

function orderObject(
	task: JsonOrderingTask,
	object: Readonly<JsonObject>,
	schedule: ScheduleJsonOrdering,
): void {
	const entries = orderedEntries(object, task.order);
	const ordered = Object.fromEntries(entries);
	task.replace(ordered);
	for (const [field, value] of entries) {
		const nested = childOrder(task.order, field);
		if (nested !== undefined) {
			schedule({
				order: nested,
				replace(result) {
					ordered[field] = result;
				},
				value,
			});
		}
	}
}

function orderTask(
	task: JsonOrderingTask,
	schedule: ScheduleJsonOrdering,
): void {
	if (isJsonArray(task.value)) {
		orderArray(task, task.value, schedule);
		return;
	}
	const object = ownedJsonObjectSchema.safeParse(task.value);
	if (object.success) {
		orderObject(task, object.data, schedule);
		return;
	}
	task.replace(task.value);
}

function orderedValue(value: JsonValue, order: JsonFieldOrder): JsonValue {
	let result = value;
	const pending: JsonOrderingTask[] = [];
	const schedule = (task: JsonOrderingTask): void => {
		pending.push(task);
	};
	schedule({
		order,
		replace(ordered) {
			result = ordered;
		},
		value,
	});
	let task = pending.pop();
	while (task !== undefined) {
		orderTask(task, schedule);
		task = pending.pop();
	}
	return result;
}

interface JsonSerialization {
	readonly json: string;
	readonly order: JsonFieldOrder;
	readonly space?: number;
}

function orderedJson({
	json,
	order,
	space = DEFAULT_JSON_INDENT_SPACES,
}: JsonSerialization): string {
	return JSON.stringify(orderedValue(parseOwnedJson(json), order), null, space);
}

export { orderedJson as default };
export type { JsonFieldOrder };
