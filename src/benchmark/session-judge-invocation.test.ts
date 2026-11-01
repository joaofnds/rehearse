import { describe, expect, it } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";

import { runCommand } from "./command";
import { claudeJsonSchema, judgeGradeResponseSchema } from "./contracts";
import { SESSION_JUDGE_SYSTEM_PROMPT } from "./session-judge-prompt";
import { RUBRIC, sessionJudgeResponse } from "./session-judge-test-fixtures";
import { TestResources } from "./test-support";

const EXECUTABLE_MODE = 0o755;
const INVOCATION_TIMEOUT_MS = 4000;
const resources = TestResources.forEachTest();

async function observedInvocation(): Promise<{
	readonly args: readonly string[];
	readonly input: string;
}> {
	const directory = await resources.createTemporaryDirectory(
		"rehearse-session-judge-invocation-",
	);
	const argsFile = join(directory, "args.txt");
	const inputFile = join(directory, "input.txt");
	const executable = join(directory, "claude");
	await Bun.write(
		executable,
		`#!/bin/sh\nprintf '%s\\n' "$@" > "$REHEARSE_JUDGE_ARGS"\ncat > "$REHEARSE_JUDGE_INPUT"\ncat "$REHEARSE_JUDGE_RESPONSE"\n`,
	);
	await chmod(executable, EXECUTABLE_MODE);
	const script = `
import runSessionJudge from ${JSON.stringify(new URL("session-judge.ts", import.meta.url).pathname)};
import { createSpendCeiling } from ${JSON.stringify(new URL("spend-ceiling.ts", import.meta.url).pathname)};
const result = await runSessionJudge({definition:{files:[], rubric:${JSON.stringify(RUBRIC)}, rubricPath:"quality.md", model:"sonnet", effort:"high", sessionBudgetUsd:0.5}, input:{files:[{path:"reply.txt",content:"untrusted candidate"}], unavailable:[]}, settings:{model:"haiku",effort:"low",budgetUsd:2}, spendCeiling:createSpendCeiling({ceilingUsd:3})});
if (result.status !== "GRADED") { throw new Error(result.detail); }
`;
	await runCommand([process.execPath, "--eval", script], directory, {
		env: {
			...Bun.env,
			PATH: `${directory}:${Bun.env["PATH"] ?? ""}`,
			REHEARSE_JUDGE_ARGS: argsFile,
			REHEARSE_JUDGE_INPUT: inputFile,
			REHEARSE_JUDGE_RESPONSE: await writeResponse(directory),
		},
		timeoutMs: INVOCATION_TIMEOUT_MS,
	});
	const args = await Bun.file(argsFile).text();
	return {
		args: args.trimEnd().split("\n"),
		input: await Bun.file(inputFile).text(),
	};
}

describe("session Judge invocation", () => {
	it("runs declared Judge overrides through the sealed adapter and supplies evidence only on stdin", async () => {
		const { args, input } = await observedInvocation();

		expect(args).toEqual([
			"-p",
			"--safe-mode",
			"--disable-slash-commands",
			"--strict-mcp-config",
			"--model",
			"sonnet",
			"--effort",
			"high",
			"--max-budget-usd",
			"0.5",
			"--output-format",
			"json",
			"--json-schema",
			claudeJsonSchema(judgeGradeResponseSchema),
			"--tools",
			"",
			"--system-prompt",
			SESSION_JUDGE_SYSTEM_PROMPT,
			"--no-session-persistence",
		]);
		expect(input).toContain('"content":"untrusted candidate"');
	});
});

async function writeResponse(directory: string): Promise<string> {
	const file = join(directory, "response.json");
	await Bun.write(file, sessionJudgeResponse({ quote: "untrusted candidate" }));
	return file;
}
