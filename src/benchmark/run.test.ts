import { describe, expect, it } from "bun:test";

const DIAGNOSTIC_PIPE_FILLER_CHARACTERS = 1_000_000;

const flushesBeforePrompt = async (): Promise<void> => {
	const expectedExitCode = 143;

	const runUrl = new URL("run.ts", import.meta.url).href;
	const questionerUrl = new URL("../cli/questioner.ts", import.meta.url).href;
	const child = Bun.spawn(
		[
			process.execPath,
			"--eval",
			`import { liveRunDiagnostics } from ${JSON.stringify(runUrl)};
import terminalQuestioner from ${JSON.stringify(questionerUrl)};
const diagnostics = liveRunDiagnostics();
const questioner = terminalQuestioner();
diagnostics.reportError("Calibration incomplete: invalid review");
await diagnostics.flush();
await questioner.question("next calibration prompt\\n");
questioner.close();
await diagnostics.flush();
process.exit(143);`,
		],
		{
			env: { ...Bun.env },
			stderr: "pipe",
			stdin: new Blob(["answer\n"]),
			stdout: "pipe",
		},
	);
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);

	expect(exitCode).toBe(expectedExitCode);
	expect(stdout).toBe("");
	expect(stderr).toBe(
		"Calibration incomplete: invalid review\nnext calibration prompt\n",
	);
};

const flushesBeforeExit = async (): Promise<void> => {
	const expectedExitCode = 143;

	const moduleUrl = new URL("run.ts", import.meta.url).href;
	const child = Bun.spawn(
		[
			process.execPath,
			"--eval",
			`import { liveRunDiagnostics } from ${JSON.stringify(moduleUrl)};
const diagnostics = liveRunDiagnostics();
diagnostics.reportError("first");
diagnostics.reportError("x".repeat(1_000_000));
await diagnostics.flush();
process.exit(143);`,
		],
		{ env: { ...Bun.env }, stderr: "pipe", stdout: "pipe" },
	);
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);

	expect(exitCode).toBe(expectedExitCode);
	expect(stdout).toBe("");
	expect(stderr).toBe(
		`first\n${"x".repeat(DIAGNOSTIC_PIPE_FILLER_CHARACTERS)}\n`,
	);
};
describe("run diagnostics", () => {
	it(
		"flushes stderr before the real terminal questioner writes the next prompt",
		flushesBeforePrompt,
	);

	it(
		"finishes queued stderr messages before exiting with the signal code",
		flushesBeforeExit,
	);
});
