import { chmod } from "node:fs/promises";
import { join } from "node:path";

import { runCommand } from "./command";
import type { TestResources } from "./test-support";

const EXECUTABLE_MODE = 0o755;
const INVOCATION_TIMEOUT_MS = 4000;

async function observeJudgeInvocation(
	resources: Readonly<TestResources>,
	kind: "final" | "stage",
): Promise<readonly string[]> {
	const directory = await resources.createTemporaryDirectory(
		"rehearse-judge-contract-",
	);
	const argsFile = join(directory, "args.txt");
	const executable = join(directory, "claude");
	await Bun.write(
		executable,
		`#!/bin/sh\nprintf '%s\\n' "$@" > "$REHEARSE_JUDGE_ARGS"\ncat > /dev/null\nprintf '%s\\n' '{"type":"result","is_error":false,"result":"captured"}'\n`,
	);
	await chmod(executable, EXECUTABLE_MODE);

	const script = `
import { finalJudgeInvoker, stageJudgeInvoker } from ${JSON.stringify(new URL("judge-invocation.ts", import.meta.url).pathname)};
const settings = { model: "sonnet", effort: undefined };
const invocations = {
 final: async () => await finalJudgeInvoker(process.cwd(), settings)("candidate", 1),
 stage: async () => await stageJudgeInvoker(process.cwd(), settings)("candidate", () => {}, 1),
};
await invocations[${JSON.stringify(kind)}]();
`;
	await runCommand([process.execPath, "--eval", script], directory, {
		env: {
			...Bun.env,
			PATH: `${directory}:${Bun.env["PATH"] ?? ""}`,
			REHEARSE_JUDGE_ARGS: argsFile,
		},
		timeoutMs: INVOCATION_TIMEOUT_MS,
	});

	const recorded = await Bun.file(argsFile).text();

	return recorded.trimEnd().split("\n");
}

export { observeJudgeInvocation as default };
