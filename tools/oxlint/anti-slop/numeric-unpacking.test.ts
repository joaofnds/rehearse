import { describe, expect, it } from "bun:test";

import ruleDiagnostics from "./rule-test-support.ts";

const rule = "anti-slop/no-numeric-object-projection";
const code = "anti-slop(no-numeric-object-projection)";
const examples = [
	{
		expected: 1,
		name: "rejects bound scalar-only unpacking of heterogeneous numeric fields",
		source:
			"const options = [{ attempts: 1 }, { retries: 3 }]; const [{ attempts: one }, { retries: three }] = options; export const counts = [one, three];",
	},
	{
		expected: 1,
		name: "rejects direct array-pattern scalar unpacking",
		source:
			"const [{ attempts: one }, { attempts: three }] = [{ attempts: 1 }, { attempts: 3 }]; export const counts = [one, three];",
	},
	{
		expected: 1,
		name: "rejects bound immutable numeric records used only for manual unpacking",
		source:
			"const options = [{ attempts: 1 }, { attempts: 3 }, { attempts: 6 }, { attempts: 12 }] as const; type Count = (typeof options)[number]['attempts']; const [{ attempts: one }, { attempts: three }, { attempts: six }, { attempts: twelve }] = options; export const counts: readonly Count[] = [one, three, six, twelve];",
	},
	{
		expected: 1,
		name: "rejects bound immutable numeric records used only for map projection",
		source:
			"const options = [{ attempts: 1 }, { attempts: 3 }] as const; export const counts = options.map(({ attempts }) => attempts);",
	},
	{
		expected: 1,
		name: "rejects asserted parenthesized direct unpacking",
		source:
			"const [{ attempts: one }] = (([{ attempts: (+1 as const) }] as const) satisfies readonly { attempts: number }[]); export const counts = [one];",
	},
	{
		expected: 1,
		name: "rejects signed computed keys in bound unpacking",
		source:
			'const options = [({ ["attempts"]: -1 }), { ["attempts"]: +3 }] as const; const [{ ["attempts"]: one }, { ["attempts"]: three }] = (options); export const counts = [one, three];',
	},
	{
		expected: 1,
		name: "rejects numeric keys in bound unpacking",
		source:
			"const options = [{ 0: 1 }] as const; const [{ [0]: one }] = options; export const counts = [one];",
	},
	{
		expected: 1,
		name: "rejects computed prototype data unpacking",
		source:
			'const [{ ["__proto__"]: one }] = [{ ["__proto__"]: 1 }]; export const counts = [one];',
	},
	{
		expected: 1,
		name: "rejects asserted bound map receivers and callbacks",
		source:
			"const options = ([{ attempts: 1 }] as const) satisfies readonly { attempts: number }[]; export const counts = ((options).map)((({ attempts }) => (attempts)));",
	},
	{
		expected: 2,
		name: "rejects multiple scalar-only consumers",
		source:
			"const options = [{ attempts: 1 }] as const; const [{ attempts: one }] = options; export const counts = options.map(({ attempts }) => attempts); export { one };",
	},
	{
		expected: 1,
		name: "rejects local wrappers despite a same-named boundary binding",
		source:
			"declare const options: readonly { attempts: number }[]; function counts() { const options = [{ attempts: 1 }] as const; return options.map(({ attempts }) => attempts); } export { options, counts };",
	},
	{
		expected: 0,
		name: "accepts a boundary binding shadowing local numeric records",
		source:
			"const options = [{ attempts: 1 }] as const; function counts(options: readonly { attempts: number }[]) { return options.map(({ attempts }) => attempts); } export { counts };",
	},
	{
		expected: 0,
		name: "accepts direct unpacking of named scenarios",
		source:
			'const [{ attempts: one }] = [{ attempts: 1, name: "opening" }]; export const counts = [one];',
	},
	{
		expected: 0,
		name: "accepts bound numeric records with an additional runtime consumer",
		source:
			"const options = [{ attempts: 1 }] as const; record(options); const [{ attempts: one }] = options; export const counts = [one];",
	},
	{
		expected: 0,
		name: "accepts bound map projection with an additional runtime consumer",
		source:
			"const options = [{ attempts: 1 }] as const; record(options); export const counts = options.map(({ attempts }) => attempts);",
	},
	{
		expected: 0,
		name: "accepts records exported at their declaration",
		source:
			"export const options = [{ attempts: 1 }] as const; const [{ attempts: one }] = options; export const counts = [one];",
	},
	{
		expected: 0,
		name: "accepts records exported through a specifier",
		source:
			"const options = [{ attempts: 1 }] as const; const [{ attempts: one }] = options; export { options }; export const counts = [one];",
	},
	{
		expected: 0,
		name: "accepts records exported as default",
		source:
			"const options = [{ attempts: 1 }] as const; const [{ attempts: one }] = options; export default options; export const counts = [one];",
	},
	{
		expected: 0,
		name: "accepts records reexported under another name",
		source:
			"const options = [{ attempts: 1 }] as const; export const counts = options.map(({ attempts }) => attempts); export { options as scenarios };",
	},
	{
		expected: 0,
		name: "accepts boundary-supplied unpacking",
		source:
			"declare const options: readonly { attempts: number }[]; const [{ attempts: one }] = options; export const counts = [one];",
	},
	{
		expected: 0,
		name: "accepts bound multi-field scenarios",
		source:
			'const options = [{ attempts: 1, name: "opening" }] as const; const [{ attempts: one }] = options; export const counts = [one];',
	},
	{
		expected: 0,
		name: "accepts reassigned record arrays",
		source:
			"let options = [{ attempts: 1 }]; options = supplied(); const [{ attempts: one }] = options; export const counts = [one];",
	},
	{
		expected: 0,
		name: "accepts a reassigned const binding without trusting its initializer",
		source:
			"const options = [{ attempts: 1 }]; options = supplied(); export const counts = options.map(({ attempts }) => attempts);",
	},
	{
		expected: 0,
		name: "accepts mutated array contents",
		source:
			"const options = [{ attempts: 1 }]; options[0] = supplied(); const [{ attempts: one }] = options; export const counts = [one];",
	},
	{
		expected: 0,
		name: "accepts mutated record properties",
		source:
			"const options = [{ attempts: 1 }]; options[0].attempts = supplied(); export const counts = options.map(({ attempts }) => attempts);",
	},
	{
		expected: 0,
		name: "accepts array mutation through a method",
		source:
			"const options = [{ attempts: 1 }]; options.push(supplied()); const [{ attempts: one }] = options; export const counts = [one];",
	},
	{
		expected: 0,
		name: "accepts an escaping alias",
		source:
			"const options = [{ attempts: 1 }] as const; const scenarios = options; const [{ attempts: one }] = options; export { scenarios }; export const counts = [one];",
	},
	{
		expected: 0,
		name: "accepts arrays retaining whole records",
		source:
			"const options = [{ attempts: 1 }] as const; const [scenario] = options; const [{ attempts: one }] = options; record(scenario); export const counts = [one];",
	},
	{
		expected: 0,
		name: "accepts unpacking with retained record properties",
		source:
			"const [{ attempts: one, ...scenario }] = [{ attempts: 1 }]; export const counts = [one]; export { scenario };",
	},
	{
		expected: 0,
		name: "accepts unpacking with a rest array of records",
		source:
			"const [{ attempts: one }, ...scenarios] = [{ attempts: 1 }, { attempts: 3 }]; export const counts = [one]; export { scenarios };",
	},
	{
		expected: 0,
		name: "accepts unpacking with a value-producing default",
		source:
			"const [{ attempts: one = supplied() }] = [{ attempts: 1 }]; export const counts = [one];",
	},
	{
		expected: 1,
		name: "rejects scalar-only unpacking of heterogeneous numeric fields",
		source:
			"const [{ attempts: one }, { retries: three }] = [{ attempts: 1 }, { retries: 3 }]; export const counts = [one, three];",
	},
	{
		expected: 0,
		name: "accepts dynamic computed keys in unpacking",
		source:
			"declare const field: string; const [{ [field]: one }] = [{ attempts: 1 }]; export const counts = [one];",
	},
	{
		expected: 0,
		name: "accepts missing array elements",
		source:
			"const [{ attempts: one }, ,] = [{ attempts: 1 }, ,]; export const counts = [one];",
	},
	{
		expected: 0,
		name: "accepts prototype setters in unpacking",
		source:
			"const [{ __proto__: one }] = [{ __proto__: 1 }]; export const counts = [one];",
	},
	{
		expected: 0,
		name: "accepts bound callbacks doing other work",
		source:
			"const options = [{ attempts: 1 }] as const; export const counts = options.map(({ attempts }) => { record(attempts); return attempts; });",
	},
	{
		expected: 0,
		name: "accepts bound asynchronous callbacks",
		source:
			"const options = [{ attempts: 1 }] as const; export const counts = options.map(async ({ attempts }) => attempts);",
	},
	{
		expected: 0,
		name: "accepts consumed records in a nested scope",
		source:
			"const options = [{ attempts: 1 }] as const; function recordOptions() { record(options); } const [{ attempts: one }] = options; export { recordOptions }; export const counts = [one];",
	},
];

describe("numeric record unpacking", () => {
	it.each(examples)("$name", async ({ expected, source }) => {
		const diagnostics = await ruleDiagnostics(source, [], rule);

		expect(
			diagnostics.filter((diagnostic) => diagnostic.code === code),
		).toHaveLength(expected);
	});
});
