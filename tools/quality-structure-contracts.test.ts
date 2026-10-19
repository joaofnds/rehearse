import { expect, it } from "bun:test";

import ruleDiagnostics from "./oxlint/anti-slop/rule-test-support";

const EXCESS_STATEMENT_COUNT = 11;
const EXCESS_FUNCTION_LINE_COUNT = 51;
const ALLOWED_FUNCTION_LINE_COUNT = 50;
const EXCESS_MODULE_LINE_COUNT = 301;
const ALLOWED_MODULE_LINE_COUNT = 300;
const FUNCTION_FIXED_LINE_COUNT = 3;
const MODULE_FIXED_LINE_COUNT = 2;
const ALLOWED_STATEMENT_COUNT = 1;
const statement = 'send("ready");\n';

function operationSource(statementCount: number): string {
	return `function execute(send: (message: string) => void): void {\n${statement.repeat(statementCount)}}\nexport { execute as default };\n`;
}

function functionSource(lineCount: number): string {
	return `function execute(send: (message: string) => void): void {\n${"\n".repeat(lineCount - FUNCTION_FIXED_LINE_COUNT)}send("ready");\n}\nexport { execute as default };\n`;
}

function moduleSource(lineCount: number): string {
	return `const value = "ready";\n${"\n".repeat(lineCount - MODULE_FIXED_LINE_COUNT)}export { value as default };\n`;
}

const dependencySource = `import { strictEqual } from "node:assert";
import { AsyncLocalStorage } from "node:async_hooks";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { Dirent } from "node:fs";
import { open } from "node:fs/promises";
import { STATUS_CODES } from "node:http";
import { tmpdir } from "node:os";
import { basename } from "node:path";
import { Readable } from "node:stream";
export { AsyncLocalStorage, Buffer, Dirent, EventEmitter, Readable, STATUS_CODES,
 basename, createHash, open, strictEqual, tmpdir };
`;

const structuralContracts = [
	{
		code: "eslint(max-statements)",
		source: operationSource(EXCESS_STATEMENT_COUNT),
	},
	{
		code: "eslint(max-lines-per-function)",
		source: functionSource(EXCESS_FUNCTION_LINE_COUNT),
	},
	{
		code: "eslint(max-lines)",
		source: moduleSource(EXCESS_MODULE_LINE_COUNT),
	},
	{
		code: "import(max-dependencies)",
		source: dependencySource,
	},
	{
		code: "anti-slop(no-numeric-object-projection)",
		source: `const amount = ({ usd: 100 }).usd;
export { amount as default };
`,
	},
];

it.each(structuralContracts)(
	"enforces the structural contract $code",
	async ({ code, source }) => {
		const diagnostics = await ruleDiagnostics(source, ["--type-aware"]);

		expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
	},
);

it("accepts a small operation under the complete root policy", async () => {
	const source = operationSource(ALLOWED_STATEMENT_COUNT);

	expect(await ruleDiagnostics(source, ["--type-aware"])).toEqual([]);
});

const allowedBoundaries = [
	{ name: "function", source: functionSource(ALLOWED_FUNCTION_LINE_COUNT) },
	{ name: "module", source: moduleSource(ALLOWED_MODULE_LINE_COUNT) },
];

it.each(allowedBoundaries)(
	"accepts a $name at its structural limit",
	async ({ source }) => {
		expect(await ruleDiagnostics(source, ["--type-aware"])).toEqual([]);
	},
);
