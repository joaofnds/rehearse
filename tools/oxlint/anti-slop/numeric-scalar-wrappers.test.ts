import { describe, expect, it } from "bun:test";

import ruleDiagnostics from "./rule-test-support.ts";

const rule = "anti-slop/no-numeric-object-projection";
const code = "anti-slop(no-numeric-object-projection)";
const examples = [
	{
		expected: 1,
		name: "rejects a directly projected numeric object",
		source: "consume(({usd:100}).usd);",
	},
	{
		expected: 1,
		name: "rejects a directly projected frozen object",
		source: "consume(Object.freeze({usd:100}).usd);",
	},
	{
		expected: 1,
		name: "rejects direct scalar object unpacking",
		source: "const {usd} = {usd:100}; consume(usd);",
	},
	{
		expected: 1,
		name: "rejects bound scalar object unpacking",
		source:
			"const ceiling = {usd:100}; const {usd: budget} = ceiling; consume(budget);",
	},
	{
		expected: 1,
		name: "rejects mixed scalar member and pattern consumers once",
		source:
			"const limits = {usd:100,turns:20}; const {usd} = limits; consume(limits.turns); consume(usd);",
	},
	{
		expected: 1,
		name: "rejects frozen object unpacking",
		source:
			"const {usd,turns} = Object.freeze({usd:100,turns:20}); consume(usd,turns);",
	},
	{
		expected: 0,
		name: "accepts direct property writes",
		source: "({usd:100}).usd = supplied();",
	},
	{
		expected: 0,
		name: "accepts object unpacking with a retained record",
		source: "const {usd,...record} = {usd:100,turns:20}; consume(usd,record);",
	},
	{
		expected: 0,
		name: "accepts object unpacking with a default",
		source: "const {usd = supplied()} = {usd:100}; consume(usd);",
	},
	{
		expected: 0,
		name: "accepts boundary object unpacking",
		source: "const {usd} = supplied(); consume(usd);",
	},
	{
		expected: 0,
		name: "accepts unpacking of an unknown field",
		source: "const {missing} = {usd:100}; consume(missing);",
	},
	{
		expected: 0,
		name: "accepts bound unpacking with a whole-record consumer",
		source:
			"const ceiling = {usd:100}; configure(ceiling); const {usd} = ceiling; consume(usd);",
	},

	{
		expected: 1,
		name: "rejects a constant single-number wrapper",
		source: "const ceiling = { usd: 100 }; consume(ceiling.usd);",
	},
	{
		expected: 1,
		name: "rejects a frozen single-number wrapper",
		source:
			"const ceiling = Object.freeze({ usd: 100 }); consume(ceiling.usd);",
	},
	{
		expected: 1,
		name: "rejects repeated scalar reads once",
		source:
			"const limits = { usd: 100, turns: 20 }; consume(limits.usd); consume(limits.turns);",
	},
	{
		expected: 1,
		name: "rejects signed and asserted scalar wrappers",
		source:
			"const limits = ({ ['usd']: -100 } as const) satisfies {usd: number}; consume((limits).usd);",
	},
	{
		expected: 1,
		name: "ignores type queries when finding scalar-only consumers",
		source:
			"const ceiling = { usd: 100 }; type Budget = typeof ceiling.usd; consume(ceiling.usd);",
	},
	{
		expected: 1,
		name: "uses the local binding despite a same-named outside record",
		source:
			"declare const ceiling: {usd:number}; function run() { const ceiling = {usd:100}; consume(ceiling.usd); } export {run,ceiling};",
	},
	{
		expected: 0,
		name: "accepts a record consumed whole",
		source:
			"const limits = {usd:100,turns:20}; configure(limits); consume(limits.usd);",
	},
	{
		expected: 0,
		name: "accepts an exported domain record",
		source:
			"const limits = {usd:100,turns:20}; export {limits}; consume(limits.usd);",
	},
	{
		expected: 0,
		name: "accepts a directly exported record",
		source: "export const limits = {usd:100}; consume(limits.usd);",
	},
	{
		expected: 0,
		name: "accepts a named scenario",
		source: "const example = {usd:100,name:'approved'}; consume(example.usd);",
	},
	{
		expected: 0,
		name: "accepts a boundary record",
		source: "declare const ceiling: {usd:number}; consume(ceiling.usd);",
	},
	{
		expected: 0,
		name: "accepts a shadowed freeze implementation",
		source:
			"function run(Object: {freeze(x: {usd:number}): {usd:number}}) { const ceiling = Object.freeze({usd:100}); consume(ceiling.usd); } export {run};",
	},
	{
		expected: 0,
		name: "accepts a changed scalar property",
		source:
			"const ceiling = {usd:100}; ceiling.usd = supplied(); consume(ceiling.usd);",
	},
	{
		expected: 0,
		name: "accepts a scalar update",
		source: "const ceiling = {usd:100}; ceiling.usd++; consume(ceiling.usd);",
	},
	{
		expected: 0,
		name: "accepts property deletion",
		source:
			"const ceiling = {usd:100}; delete ceiling.usd; consume(ceiling.usd);",
	},
	{
		expected: 0,
		name: "accepts writes through destructuring",
		source:
			"const ceiling = {usd:100}; ({value: ceiling.usd} = supplied()); consume(ceiling.usd);",
	},
	{
		expected: 0,
		name: "accepts writes through array destructuring",
		source:
			"const ceiling = {usd:100}; [ceiling.usd] = supplied(); consume(ceiling.usd);",
	},
	{
		expected: 0,
		name: "accepts a changing binding",
		source:
			"let ceiling = {usd:100}; ceiling = supplied(); consume(ceiling.usd);",
	},
	{
		expected: 0,
		name: "accepts an escaping alias",
		source:
			"const ceiling = {usd:100}; const alias = ceiling; consume(alias); consume(ceiling.usd);",
	},
	{
		expected: 0,
		name: "accepts an unknown computed field",
		source: "const ceiling = {usd:100}; consume(ceiling[supplied()]);",
	},
	{
		expected: 0,
		name: "accepts a getter",
		source: "const ceiling = {get usd(){return 100}}; consume(ceiling.usd);",
	},
	{
		expected: 0,
		name: "accepts a prototype setter",
		source: "const ceiling = {__proto__:100}; consume(ceiling.__proto__);",
	},
	{
		expected: 0,
		name: "accepts type-only records",
		source:
			"const ceiling = {usd:100}; type Budget = typeof ceiling.usd; export type {Budget};",
	},
];

describe("numeric scalar wrappers", () => {
	it.each(examples)("$name", async ({ expected, source }) => {
		const diagnostics = await ruleDiagnostics(source, [], rule);

		expect(
			diagnostics.filter((diagnostic) => diagnostic.code === code),
		).toHaveLength(expected);
	});
});
