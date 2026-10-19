import { expect, it } from "bun:test";

import ruleDiagnostics from "./oxlint/anti-slop/rule-test-support";

const languageContracts = [
	{
		code: "oxc(no-async-await)",
		rule: "oxc/no-async-await",
		source: `async function read(operation: Promise<string>): Promise<string> {
 const result = await operation;
 return result;
}
export { read as default };
`,
	},
	{
		code: "oxc(no-optional-chaining)",
		rule: "oxc/no-optional-chaining",
		source: `interface Owner { readonly value: string }
function value(owner: Owner | undefined): string | undefined {
 return owner?.value;
}
export { value as default };
`,
	},
	{
		code: "oxc(no-rest-spread-properties)",
		rule: "oxc/no-rest-spread-properties",
		source: `interface Owner { readonly value: string }
function copy(owner: Owner): Owner { return { ...owner }; }
export { copy as default };
`,
	},
	{
		code: "eslint(no-ternary)",
		rule: "no-ternary",
		source: `function label(active: boolean): string {
 return active ? "ready" : "waiting";
}
export { label as default };
`,
	},
	{
		code: "eslint(no-undefined)",
		rule: "no-undefined",
		source: `const own = { value: undefined };
export { own as default };
`,
	},
	{
		code: "unicorn(no-null)",
		rule: "unicorn/no-null",
		source: `const payload = { value: null };
export { payload as default };
`,
	},
	{
		code: "import(no-named-export)",
		rule: "import/no-named-export",
		source: `const label = "status";
const value = "ready";
export { label, value };
`,
	},
	{
		code: "import(no-default-export)",
		rule: "import/no-default-export",
		source: `const value = "ready";
export { value as default };
`,
	},
	{
		code: "import(no-nodejs-modules)",
		rule: "import/no-nodejs-modules",
		source: `import type { AsyncLocalStorage } from "node:async_hooks";

interface Owner { readonly context: AsyncLocalStorage<string> }
export type { Owner };
`,
	},
	{
		code: "node(no-top-level-await)",
		rule: "node/no-top-level-await",
		source: `const ready = await Promise.resolve("ready");
export { ready as default };
`,
	},
];

it.each(languageContracts)(
	"preserves a supported language contract rejected by $rule",
	async ({ code, rule, source }) => {
		expect(await ruleDiagnostics(source, ["--type-aware"])).toEqual([]);
		const conflicting = await ruleDiagnostics(source, [
			"--type-aware",
			"-D",
			rule,
		]);
		expect(conflicting.map((diagnostic) => diagnostic.code)).toContain(code);
	},
);

it("keeps native rejection of void expressions", async () => {
	const diagnostics = await ruleDiagnostics(`const own = { value: void 0 };
export { own as default };
`);
	expect(diagnostics.map(({ code }) => code)).toContain("eslint(no-void)");
});

it("keeps undefined immutable and distinguishes its own property from absence", () => {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, "undefined");
	const owner = { value: undefined };
	expect(descriptor).toMatchObject({ configurable: false, writable: false });
	expect(Object.hasOwn(owner, "value")).toBe(true);
	expect(owner.value).toBeUndefined();
	expect(JSON.stringify(owner)).toBe("{}");
	expect(JSON.stringify({ value: null })).toBe('{"value":null}');
});

const globalProtection = [
	{
		code: "eslint(no-shadow-restricted-names)",
		source: `function shadow(undefined: string): string { return undefined; }
export { shadow as default };
`,
	},
	{
		code: "eslint(no-global-assign)",
		source: `const marker = "ready";
undefined = "changed";
export { marker as default };
`,
	},
	{
		code: "eslint(no-shadow)",
		source: `function label(String: string): string { return String; }
export { label as default };
`,
	},
];

it.each(globalProtection)(
	"protects built-ins with $code",
	async ({ code, source }) => {
		const diagnostics = await ruleDiagnostics(source);
		expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
	},
);

const requiredLanguagePolicies = [
	{
		code: "import(prefer-default-export)",
		source: `const value = "ready";
export { value };
`,
	},
	{
		code: "typescript(promise-function-async)",
		source: `function read(operation: Promise<string>): Promise<string> {
 return operation.then((value) => value);
}
export { read as default };
`,
	},
	{
		code: "typescript(prefer-optional-chain)",
		source: `interface Owner { readonly value: string }
function value(owner: Owner | undefined): string | undefined {
 return owner && owner.value;
}
export { value as default };
`,
	},
	{
		code: "eslint(prefer-object-spread)",
		source: `interface Owner { readonly value: string }
function copy(owner: Owner): Owner { return Object.assign({}, owner); }
export { copy as default };
`,
	},
	{
		code: "unicorn(prefer-ternary)",
		source: `function label(active: boolean): string {
 let value = "";
 if (active) { value = "ready"; } else { value = "waiting"; }
 return value;
}
export { label as default };
`,
	},
	{
		code: "unicorn(prefer-top-level-await)",
		source: `const status = { ready: false };
async function initialize(): Promise<void> {
 status.ready = await Promise.resolve(true);
}
void initialize();
export { status as default };
`,
	},
];

it.each(requiredLanguagePolicies)(
	"retains the selected requirement $code",
	async ({ code, source }) => {
		const diagnostics = await ruleDiagnostics(source, ["--type-aware"]);
		expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
	},
);
