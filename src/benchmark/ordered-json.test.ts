import { expect, it } from "bun:test";

import { z } from "zod";

import orderedJson from "./ordered-json";

const COMPACT_JSON_INDENT_SPACES = 0;
const DEEP_JSON_NESTING_LEVELS = 6000;

it("retains fields the protocol order does not name", () => {
	const json = '{"extra":true,"last":2,"first":1}';

	const serialized = orderedJson({
		json,
		order: { fields: ["first", "last"] },
	});

	expect(serialized).toBe('{\n  "first": 1,\n  "last": 2,\n  "extra": true\n}');
});

it("retains a field whose name is inherited by the protocol description", () => {
	const json = '{"first":1,"constructor":{"extra":true}}';

	const serialized = orderedJson({
		json,
		order: { children: {}, fields: ["first"] },
	});

	expect(serialized).toBe(
		'{\n  "first": 1,\n  "constructor": {\n    "extra": true\n  }\n}',
	);
});

it("keeps nulls, array positions and exact text through nested protocol fields", () => {
	const json = String.raw`{"items":[{"last":null,"first":"\u00e9\n\uD83D\uDE00"},{"last":2,"first":"second"}]}`;

	const serialized = orderedJson({
		json,
		order: {
			children: { items: { fields: ["first", "last"] } },
			fields: ["items"],
		},
	});

	expect(serialized).toBe(
		'{\n  "items": [\n    {\n      "first": "é\\n😀",\n      "last": null\n    },\n    {\n      "first": "second",\n      "last": 2\n    }\n  ]\n}',
	);
});
it("preserves an own prototype field at the root", () => {
	const json = '{"__proto__":{"preserved":true},"first":1}';

	const serialized = orderedJson({ json, order: { fields: ["first"] } });

	expect(serialized).toBe(
		'{\n  "first": 1,\n  "__proto__": {\n    "preserved": true\n  }\n}',
	);
});

it("preserves an own prototype field in an unordered nested object", () => {
	const json = '{"first":1,"nested":{"__proto__":{"preserved":true}}}';

	const serialized = orderedJson({ json, order: { fields: ["first"] } });

	expect(serialized).toBe(
		'{\n  "first": 1,\n  "nested": {\n    "__proto__": {\n      "preserved": true\n    }\n  }\n}',
	);
});

it("preserves own prototype and constructor fields while ordering array items", () => {
	const json =
		'[{"__proto__":{"preserved":true},"constructor":{"extra":true},"first":1}]';

	const serialized = orderedJson({
		json,
		order: { children: {}, fields: ["first", "constructor", "__proto__"] },
	});

	expect(serialized).toBe(
		'[\n  {\n    "first": 1,\n    "constructor": {\n      "extra": true\n    },\n    "__proto__": {\n      "preserved": true\n    }\n  }\n]',
	);
});

it("preserves prototype fields inside a nested ordered array", () => {
	const json = '{"items":[{"__proto__":{"preserved":true},"first":1}]}';

	const serialized = orderedJson({
		json,
		order: {
			children: { items: { fields: ["first", "__proto__"] } },
			fields: ["items"],
		},
	});

	expect(serialized).toBe(
		'{\n  "items": [\n    {\n      "first": 1,\n      "__proto__": {\n        "preserved": true\n      }\n    }\n  ]\n}',
	);
});
it("validates numbers owned by prototype fields before serializing", () => {
	const json = '{"__proto__":{"number":1e400}}';
	const serialize = (): string =>
		orderedJson({
			json,
			order: { fields: [] },
		});

	expect(serialize).toThrow(z.ZodError);
});
it("orders record values while preserving model-name ownership and insertion order", () => {
	const json =
		'{"second":{"last":2,"first":1},"__proto__":{"last":4,"first":3},"constructor":{"last":6,"first":5}}';

	const serialized = orderedJson({
		json,
		order: { fields: [], values: { fields: ["first", "last"] } },
		space: COMPACT_JSON_INDENT_SPACES,
	});

	expect(serialized).toBe(
		'{"second":{"first":1,"last":2},"__proto__":{"first":3,"last":4},"constructor":{"first":5,"last":6}}',
	);
});

it("serializes deeply nested valid JSON without exhausting the stack", () => {
	const json = `${'{"value":'.repeat(DEEP_JSON_NESTING_LEVELS)}"leaf"${"}".repeat(DEEP_JSON_NESTING_LEVELS)}`;

	const actual = orderedJson({
		json,
		order: { fields: [] },
		space: COMPACT_JSON_INDENT_SPACES,
	});

	expect(actual).toBe(JSON.stringify(JSON.parse(json)));
});

it("validates non-finite numbers below deeply nested own prototype fields", () => {
	const json = `{"__proto__":${'{"value":'.repeat(DEEP_JSON_NESTING_LEVELS)}1e400${"}".repeat(DEEP_JSON_NESTING_LEVELS)}}`;
	const serialize = (): string => orderedJson({ json, order: { fields: [] } });

	expect(serialize).toThrow(z.ZodError);
});

it("orders deeply nested arrays without exhausting the stack", () => {
	const json = `${"[".repeat(DEEP_JSON_NESTING_LEVELS)}null${"]".repeat(DEEP_JSON_NESTING_LEVELS)}`;

	const actual = orderedJson({
		json,
		order: { fields: [] },
		space: COMPACT_JSON_INDENT_SPACES,
	});

	expect(actual).toBe(JSON.stringify(JSON.parse(json)));
});
