import { describe, expect, it } from "bun:test";

import terminalQuestioner from "./questioner";

interface QuestionerResult {
	readonly code: number;
	readonly stderr: string;
	readonly stdout: string;
}

const CHILD_EXIT_TIMEOUT_MS = 2000;
const DIAGNOSTIC_CHARACTER_COUNT = 1_000_000;
const scenarios = [
	{
		expectedStderr: `${"x".repeat(DIAGNOSTIC_CHARACTER_COUNT)}\nprompt\n`,
		label: "the default output",
		setup: `const questioner = terminalQuestioner();
processOutput.stderr("x".repeat(${String(DIAGNOSTIC_CHARACTER_COUNT)}) + "\\n");`,
	},
	{
		expectedStderr: "buffered diagnostic\nprompt\n",
		label: "the caller's buffered output",
		setup: `const pending = ["buffered diagnostic\\n"];
const questioner = terminalQuestioner(async () => {
 await Bun.write(Bun.stderr, pending.join(""));
 pending.length = 0;
});`,
	},
] as const;

function startQuestioner(
	setup: string,
): Bun.Subprocess<"pipe", "pipe", "pipe"> {
	const questionerUrl = new URL("questioner.ts", import.meta.url).href;
	const outputUrl = new URL("output.ts", import.meta.url).href;
	return Bun.spawn(
		[
			process.execPath,
			"--eval",
			`import terminalQuestioner from ${JSON.stringify(questionerUrl)};
import { processOutput } from ${JSON.stringify(outputUrl)};
${setup}
const answer = await questioner.question("prompt\\n");
questioner.close();
await Bun.write(Bun.stdout, answer + "\\n");`,
		],
		{
			env: { ...Bun.env },
			killSignal: "SIGKILL",
			stderr: "pipe",
			stdin: "pipe",
			stdout: "pipe",
			timeout: CHILD_EXIT_TIMEOUT_MS,
		},
	);
}

async function questionerResponse(setup: string): Promise<QuestionerResult> {
	const child = startQuestioner(setup);
	try {
		await child.stdin.write("answer\n");
		await child.stdin.end();
		const [code, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		return { code, stderr, stdout };
	} finally {
		if (child.exitCode === null) {
			child.kill("SIGKILL");
		}
		await child.exited;
	}
}

describe(terminalQuestioner.name, () => {
	it.each([...scenarios])(
		"flushes $label without losing piped input",
		async ({ setup, expectedStderr }) => {
			const result = await questionerResponse(setup);

			expect(result).toEqual({
				code: 0,
				stderr: expectedStderr,
				stdout: "answer\n",
			});
		},
	);
});
