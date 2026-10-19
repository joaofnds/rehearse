import { describe, expect, it } from "bun:test";

import SignalTestProcess from "./signal-test-process";
import type { SignalResult } from "./signal-test-process";

const DIAGNOSTIC_PIPE_FILLER_CHARACTERS = 1_000_000;

function signalProgram(setup: string): string {
	const stopUrl = new URL("stop-on-signal.ts", import.meta.url).href;
	const outputUrl = new URL("../cli/output.ts", import.meta.url).href;
	return `import { stopOnSignal, processSignalStop } from ${JSON.stringify(stopUrl)};
import { processOutput, signalDiagnostics } from ${JSON.stringify(outputUrl)};
setInterval(() => {}, 1000);
${setup}
await Bun.write(Bun.stdout, "ready\\n");`;
}

async function signalProcess(
	setup: string,
	signal: NodeJS.Signals,
): Promise<SignalResult> {
	const child = SignalTestProcess.start(signalProgram(setup));
	try {
		await child.signalAfter("ready\n", signal);
		const result = await child.result();
		return result;
	} finally {
		await child.close();
	}
}

const signalCases = [
	{ code: 130, signal: "SIGINT" },
	{ code: 143, signal: "SIGTERM" },
	{ code: 129, signal: "SIGHUP" },
] as const;

describe("process signal shutdown", () => {
	it.each([...signalCases])(
		"writes the complete cleanup diagnostic before $signal exits with $code",
		async ({ signal, code }) => {
			const result = await signalProcess(
				`stopOnSignal(processSignalStop(signalDiagnostics(processOutput)), async () => {
  await Promise.resolve();
  throw new Error("x".repeat(1_000_000));
});`,
				signal,
			);

			expect(result).toEqual({
				code,
				stderr: `Received ${signal}; stopping.\nCould not clean up after the stop: ${"x".repeat(DIAGNOSTIC_PIPE_FILLER_CHARACTERS)}\n`,
				stdout: "",
			});
		},
	);

	it.each([...signalCases])(
		"restores the process default for $signal when released",
		async ({ signal, code }) => {
			const result = await signalProcess(
				`const release = stopOnSignal(processSignalStop(signalDiagnostics(processOutput)), async () => {
  await Promise.resolve();
});
release();`,
				signal,
			);

			expect(result).toEqual({ code, stderr: "", stdout: "" });
		},
	);
});

describe("process signal shutdown during cleanup", () => {
	it("retains the first signal's exit code until cleanup finishes after a second signal", async () => {
		const child = SignalTestProcess.start(
			signalProgram(`
const cleanupReleased = Promise.withResolvers();
process.stdin.once("data", () => { cleanupReleased.resolve(); });
stopOnSignal(processSignalStop(signalDiagnostics(processOutput)), async () => {
 await Bun.write(Bun.stdout, "cleanup started\\n");
 await cleanupReleased.promise;
 await Bun.write(Bun.stdout, "cleanup finished\\n");
});
process.on("SIGINT", () => { process.stdout.write("second received\\n"); });`),
		);
		try {
			await child.signalAfter("ready\n", "SIGTERM");
			await child.signalAfter("cleanup started\n", "SIGINT");
			await child.expectPhase("second received\n");
			await child.releaseCleanup();
			const result = await child.result();

			expect(result).toEqual({
				code: 143,
				stderr: "Received SIGTERM; stopping.\n",
				stdout: "cleanup finished\n",
			});
		} finally {
			await child.close();
		}
	});
});
