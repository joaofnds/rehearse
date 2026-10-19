import { describe, expect, it } from "bun:test";

import ruleDiagnostics from "./rule-test-support.ts";

const rule = "anti-slop/no-numeric-object-projection";
const code = "anti-slop(no-numeric-object-projection)";

const examples = [
	{
		expected: 1,
		name: "rejects optional map calls projecting numeric wrappers",
		source:
			"const values = [{ durationMs: 1 }].map?.(({ durationMs }) => durationMs); export { values as default };",
	},
	{
		expected: 1,
		name: "rejects optional map receivers projecting numeric wrappers",
		source:
			"const values = [{ durationMs: 1 }]?.map(({ durationMs }) => durationMs); export { values as default };",
	},
	{
		expected: 1,
		name: "rejects numbers wrapped only for destructuring projection",
		source:
			"const durations = [{ durationMs: 1 }, { durationMs: 3 }].map(({ durationMs }) => durationMs); export { durations as default };",
	},
	{
		expected: 1,
		name: "rejects renamed destructuring projections",
		source:
			"const durations = [{ durationMs: 1 }].map(({ durationMs: elapsed }) => elapsed); export { durations as default };",
	},
	{
		expected: 1,
		name: "rejects direct property projections",
		source:
			"const durations = [{ durationMs: 1 }].map((sample) => sample.durationMs); export { durations as default };",
	},
	{
		expected: 1,
		name: "rejects a block that only returns the wrapped number",
		source:
			"const durations = [{ durationMs: 1 }].map(({ durationMs }) => { return durationMs; }); export { durations as default };",
	},
	{
		expected: 1,
		name: "rejects signed numeric wrappers",
		source:
			"const offsets = [{ lineOffset: -1 }].map(({ lineOffset }) => lineOffset); export { offsets as default };",
	},
	{
		expected: 0,
		name: "accepts independent named scalar quantities",
		source:
			"const firstDurationMs = 1; const nextDurationMs = 3; const durations = [firstDurationMs, nextDurationMs]; export { durations as default };",
	},
	{
		expected: 0,
		name: "accepts projections from records supplied by a boundary",
		source:
			"interface Sample { readonly durationMs: number; } declare const samples: readonly Sample[]; const durations = samples.map(({ durationMs }) => durationMs); export { durations as default };",
	},
	{
		expected: 0,
		name: "accepts records carrying other scenario data",
		source:
			'const durations = [{ durationMs: 1, name: "opening" }].map(({ durationMs }) => durationMs); export { durations as default };',
	},
	{
		expected: 0,
		name: "accepts a transformation of a recorded quantity",
		source:
			"const scale = 2; const durations = [{ durationMs: 1 }].map(({ durationMs }) => durationMs * scale); export { durations as default };",
	},
	{
		expected: 1,
		name: "rejects quoted property names",
		source:
			'const values = [{ "duration-ms": 1 }].map(({ "duration-ms": duration }) => duration); export { values as default };',
	},
	{
		expected: 1,
		name: "rejects ordinary function projections",
		source:
			"const values = [{ durationMs: 1 }].map(function project(sample) { return sample.durationMs; }); export { values as default };",
	},
	{
		expected: 1,
		name: "rejects parenthesized wrappers and return values",
		source:
			"const values = ([({ durationMs: (1) })]).map(({ durationMs }) => (durationMs)); export { values as default };",
	},
	{
		expected: 1,
		name: "rejects overflowing numeric literal wrappers",
		source:
			"const values = [{ durationMs: 1e999 }].map(({ durationMs }) => durationMs); export { values as default };",
	},
	{
		expected: 0,
		name: "accepts asynchronous projections with promise results",
		source:
			"const values = [{ durationMs: 1 }].map(async ({ durationMs }) => durationMs); export { values as default };",
	},
	{
		expected: 0,
		name: "accepts generator projections with iterator results",
		source:
			"const values = [{ durationMs: 1 }].map(function* project(sample) { return sample.durationMs; }); export { values as default };",
	},
	{
		expected: 0,
		name: "accepts string records",
		source:
			'const values = [{ durationMs: "1" }].map(({ durationMs }) => durationMs); export { values as default };',
	},
	{
		expected: 0,
		name: "accepts prototype setters without an own numeric property",
		source:
			"const values = [{ __proto__: 1 }].map(({ __proto__ }) => __proto__); export { values as default };",
	},
	{
		expected: 0,
		name: "accepts getters rather than literal numeric properties",
		source:
			"const values = [{ get durationMs() { return 1; } }].map(({ durationMs }) => durationMs); export { values as default };",
	},
	{
		expected: 0,
		name: "accepts a callback performing other work",
		source:
			"const values = [{ durationMs: 1 }].map(({ durationMs }) => { record(durationMs); return durationMs; }); export { values as default };",
	},
	{
		expected: 0,
		name: "accepts projections of another property",
		source:
			"const values = [{ durationMs: 1 }].map((sample) => sample.other); export { values as default };",
	},
	{
		expected: 0,
		name: "accepts sparse arrays with missing records",
		source:
			"const values = [{ durationMs: 1 }, ,].map(({ durationMs }) => durationMs); export { values as default };",
	},
	{
		expected: 1,
		name: "rejects numeric property names",
		source:
			"const values = [{0:1}].map(({0:value})=>value); export { values as default };",
	},
	{
		expected: 1,
		name: "rejects numeric bracket projections",
		source:
			"const values = [{0:1}].map(sample=>sample[0]); export { values as default };",
	},
	{
		expected: 1,
		name: "rejects fixed string bracket projections",
		source:
			'const values = [{"duration-ms":1}].map(sample=>sample["duration-ms"]); export { values as default };',
	},
	{
		expected: 1,
		name: "rejects fixed computed property names",
		source:
			'const values = [{["duration-ms"]:1}].map(({"duration-ms":value})=>value); export { values as default };',
	},
	{
		expected: 1,
		name: "rejects computed prototype data properties",
		source:
			'const values = [{["__proto__"]:1}].map(sample=>sample["__proto__"]); export { values as default };',
	},
	{
		expected: 1,
		name: "rejects a parenthesized callback",
		source:
			"const values = [{durationMs:1}].map((({durationMs})=>durationMs)); export { values as default };",
	},
	{
		expected: 1,
		name: "rejects a parenthesized member receiver",
		source:
			"const values = [{durationMs:1}].map(sample=>(sample).durationMs); export { values as default };",
	},
	{
		expected: 1,
		name: "rejects a parenthesized map callee",
		source:
			"const values = ([{durationMs:1}].map)(({durationMs})=>durationMs); export { values as default };",
	},
	{
		expected: 0,
		name: "accepts dynamic property access",
		source:
			'declare const field: string; const values = [{"duration-ms":1}].map(sample=>sample[field]); export { values as default };',
	},
	{
		expected: 0,
		name: "accepts dynamic property construction",
		source:
			"declare const field: string; const values = [{[field]:1}].map(sample=>sample.durationMs); export { values as default };",
	},
];

describe("numeric object projection", () => {
	it.each(examples)("$name", async ({ expected, source }) => {
		const diagnostics = await ruleDiagnostics(source, [], rule);

		expect(
			diagnostics.filter((diagnostic) => diagnostic.code === code),
		).toHaveLength(expected);
	});
});
