import type { RuleFixture } from "./rule-test-support.ts";

const fixtures: readonly RuleFixture[] = [
	{
		locations: [{ column: 9, length: 6, line: 5 }],
		name: "follows values into awaits without accepting discarded continuation results",
		rule: "require-return-or-await-for-next",
		source: `async function middleware(next: () => Promise<void>, enabled: boolean, work: () => Promise<void>): Promise<void> {
 await (enabled ? next() : Promise.resolve());
 await (enabled && next());
 await (work(), next());
 await (next(), work());
}
`,
	},
	{
		locations: [{ column: 19, length: 6, line: 2 }],
		name: "retains completion checks for synchronous next callbacks",
		rule: "require-return-or-await-for-next",
		source: `function complete(next: () => void, condition: boolean): void {
 if (condition) { next(); }
 next();
}
`,
	},
	{
		locations: [],
		name: "accepts terminal callbacks and awaited promise continuations",
		rule: "require-return-or-await-for-next",
		source: `function complete(next: () => void, condition: boolean): void {
 if (condition) { next(); return; }
 next();
}
function result(next: () => number): number { return next(); }
async function middleware(next: () => Promise<void>): Promise<void> { await next(); }
const forward = (next: () => Promise<void>) => next();
if (condition) { next(); }
`,
	},
	{
		locations: [{ column: 2, length: 6, line: 2 }],
		name: "rejects next callbacks followed by more work",
		rule: "require-return-or-await-for-next",
		source: `function complete(next: () => void, work: () => void): void {
 next();
 work();
}
`,
	},
	{
		locations: [{ column: 16, length: 36, line: 3 }],
		name: "rejects chained assertions but accepts a single assertion and const-only chains",
		rule: "no-chained-type-assertions",
		source: `declare const input: {value:number};
const plain = input as {value:number};
const double = (input as unknown) as {value:number};
const consts = ({value:1} as const) as const;
`,
	},
	{
		locations: [{ column: 18, length: 28, line: 2 }],
		name: "rejects conditional omission without rejecting ordinary object and array spreads",
		rule: "no-conditional-empty-object-spread",
		source: `declare const active:boolean;
const omitted = {...(active ? {value:1} : {})};
const retained = {...(active ? {value:1} : {value:2})};
const array = [...(active ? [1] : [])];
`,
	},
	{
		locations: [{ column: 25, length: 5, line: 4 }],
		name: "retains known-value evidence through stable aliases",
		rule: "no-known-value-widening",
		source: `interface Owner {value:number}
const precise = {value:1};
const alias = precise;
const widened: object = alias;
const checked = precise satisfies Owner;
const accumulator: Record<string, number> = {};
const owner: Owner = precise;
`,
	},
	{
		locations: [
			{ column: 1, length: 21, line: 3 },
			{ column: 1, length: 27, line: 4 },
			{ column: 1, length: 36, line: 5 },
			{ column: 1, length: 17, line: 6 },
			{ column: 1, length: 20, line: 7 },
		],
		name: "resolves framework import aliases and globals without rejecting lexical shadows",
		rule: "no-module-mocking",
		source: `import {vi as browser} from "vitest";
import {jest as checker} from "@jest/globals";
browser.mock("first");
browser["doMock"]("second");
checker.unstable_mockModule("third");
vi.mock("fourth");
jest.doMock("fifth");
function shadow(vi: {mock:(name:string)=>void}) {vi.mock("allowed");}
`,
	},
	{
		locations: [
			{ column: 25, length: 5, line: 2 },
			{ column: 23, length: 18, line: 3 },
		],
		name: "rejects broad object aliases and unions while accepting owned and generic inputs",
		rule: "no-object-parameters",
		source: `type Broad = object;
function aliased(value: Broad): void {}
function union(value: object | undefined): void {}
function owned(value: {value:number}): void {}
function generic<Value>(value:Value): void {}
`,
	},
	{
		locations: [
			{ column: 1, length: 29, line: 1 },
			{ column: 1, length: 32, line: 2 },
		],
		name: "rejects global Reflect.apply without rejecting a shadowed owner",
		rule: "no-reflect-apply",
		source: `Reflect.apply(call, null, []);
Reflect["apply"](call, null, []);
function owned(Reflect: {apply:()=>void}) {Reflect.apply();}
`,
	},
	{
		locations: [
			{ column: 1, length: 27, line: 1 },
			{ column: 1, length: 31, line: 2 },
		],
		name: "rejects global Reflect.get without rejecting a shadowed owner",
		rule: "no-reflect-get",
		source: `Reflect.get(value, "first");
Reflect["get"](value, "second");
function owned(Reflect: {get:()=>void}) {Reflect.get();}
`,
	},
	{
		locations: [
			{ column: 17, length: 18, line: 2 },
			{ column: 64, length: 12, line: 4 },
		],
		name: "rejects runtime typeof including type guards while accepting type queries",
		rule: "no-runtime-typeof",
		source: `declare const input: {value:number};
const runtime = typeof input.value;
type Query = typeof input;
function guard(value: object): value is {value:number} {return typeof value === "object";}
`,
	},
	{
		locations: [
			{ column: 7, length: 8, line: 1 },
			{ column: 16, length: 10, line: 3 },
		],
		name: "rejects forbidden symbol substrings in ordinary and JSX names",
		rule: "no-shape-in-symbol-names",
		source: `const badShape = 1;
const useful = 2;
const panel = <ShapePanel />;
`,
	},
	{
		locations: [{ column: 20, length: 7, line: 1 }],
		name: "requires parsed inputs while retaining the explicit error cause contract",
		rule: "no-unknown-parameters",
		source: `function bad(value:unknown):void {}
function failure(cause:unknown):void {}
function generic<Value>(value:Value):void {}
`,
	},
	{
		locations: [
			{ column: 17, length: 7, line: 2 },
			{ column: 28, length: 16, line: 3 },
			{ column: 79, length: 7, line: 5 },
		],
		name: "resolves return aliases while respecting generic, inferred, and mapped type binders",
		rule: "no-unknown-returns",
		source: `type Missing = unknown;
function bad(): Missing {throw new Error();}
async function asyncBad(): Promise<unknown> {throw new Error();}
function generic<Missing>(): Missing {throw new Error();}
type Choice<Value> = Value extends [infer Missing] ? (() => Missing) : (() => Missing);
type Mapped = {[Missing in "ok"]: () => Missing};
`,
	},
	{
		locations: [
			{ column: 6, length: 7, line: 1 },
			{ column: 6, length: 5, line: 2 },
		],
		name: "rejects aliases that conceal unknown without rejecting owner types",
		rule: "no-unknown-type-aliases",
		source: `type Missing = unknown;
type Alias = Missing;
type Container<Value> = Value;
type Ordinary = {value:string};
`,
	},
	{
		locations: [
			{ column: 15, length: 23, line: 1 },
			{ column: 12, length: 13, line: 3 },
			{ column: 15, length: 21, line: 6 },
			{ column: 19, length: 21, line: 7 },
			{ column: 15, length: 25, line: 8 },
		],
		name: "resolves unsafe dictionary values through aliases, empty interfaces, and mapped types",
		rule: "no-unsafe-dictionary-type",
		source: `type Unsafe = Record<string, unknown>;
type Alias<Value> = Record<string, Value>;
type Bad = Alias<object>;
type Good = Alias<number>;
interface Empty {}
type Hidden = Record<string, Empty>;
type Dictionary = {[key:string]:object};
type Mapped = {[key in string]:unknown};
`,
	},
	{
		locations: [{ column: 19, length: 24, line: 4 }],
		name: "rejects widening and later recovery while ignoring mutable bindings",
		rule: "no-widen-then-assert",
		source: `interface Owner {value:number}
const original = {value:1};
const erased: unknown = original;
const recovered = erased as {value:number};
const accepted = original satisfies Owner;
let mutable: unknown = original;
const ignored = mutable as Owner;
`,
	},
	{
		locations: [{ column: 17, length: 23, line: 2 }],
		name: "requires safety evidence and recognizes comments attached to export wrappers",
		rule: "require-safety-comment-for-type-assertion",
		source: `declare const input: unknown;
const missing = input as {value:number};
// SAFETY: The boundary already validated this owner value.
const checked = input as {value:number};
// SAFETY: The export wrapper retains the same validated owner value.
export const exported = input as {value:number};
const constant = {value:1} as const;
`,
	},
	{
		locations: [],
		name: "does not mistake shadowed built-in names for unsafe dictionary contracts",
		rule: "no-unsafe-dictionary-type",
		source: `type Record<Value> = Value;
type Safe = Record<unknown>;
`,
	},
	{
		locations: [],
		name: "does not classify merged interfaces as effectively empty",
		rule: "no-unsafe-dictionary-type",
		source: `interface Empty {}
interface Empty {}
type Dictionary = Record<string, Empty>;
`,
	},
	{
		locations: [{ column: 28, length: 9, line: 2 }],
		name: "reports computed regular-expression method names with native stringification",
		rule: "no-known-value-widening",
		source: `class Owner {
 [/x/mi](): object {return {value:1};}
}
`,
	},
];

export { fixtures as default };
