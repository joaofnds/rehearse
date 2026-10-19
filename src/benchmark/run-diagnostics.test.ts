import { describe, expect, it } from "bun:test";

import { flushRunDiagnostics } from "./run-diagnostics";
import SignalTestProcess from "./signal-test-process";

const DIAGNOSTIC_PIPE_FILLER_CHARACTERS = 1_000_000;

describe("pipeline signal diagnostics", () => {
	it("drains cleanup progress and private errors before signal termination", async () => {
		const diagnosticsUrl = new URL("run-diagnostics.ts", import.meta.url).href;
		const signalsUrl = new URL("process-signals.ts", import.meta.url).href;
		const abortUrl = new URL("run-abort.ts", import.meta.url).href;
		const outputUrl = new URL("../cli/output.ts", import.meta.url).href;
		const child =
			SignalTestProcess.start(`import { liveRunDiagnostics, flushRunDiagnostics } from ${JSON.stringify(diagnosticsUrl)};
import processSignals from ${JSON.stringify(signalsUrl)};
import { createRunAbort } from ${JSON.stringify(abortUrl)};
import { processOutput, signalDiagnostics } from ${JSON.stringify(outputUrl)};
const diagnostics = liveRunDiagnostics();
const progress = signalDiagnostics(processOutput);
createRunAbort({
 ...processSignals(async () => { await flushRunDiagnostics(diagnostics, progress); }),
 killActiveCommands: async () => { await Promise.resolve(); },
 reportError: diagnostics.reportError,
 persistence: { write: async () => { await Promise.resolve(); } },
}, {
 artifactFile: "unused",
 operatorStopFile: "unused",
 teardown: async () => {
  progress.log("x".repeat(1_000_000));
  progress.log("cleanup finished");
  await Promise.resolve();
 },
});
setInterval(() => {}, 1000);
process.kill(process.pid, "SIGTERM");`);
		try {
			const result = await child.result();

			expect(result).toEqual({
				code: 143,
				stderr: `\nReceived SIGTERM; removing the run's checkout before exit.\n${"x".repeat(DIAGNOSTIC_PIPE_FILLER_CHARACTERS)}\ncleanup finished\n`,
				stdout: "",
			});
		} finally {
			await child.close();
		}
	});
});

describe(flushRunDiagnostics.name, () => {
	it("finishes progress flushing before propagating a private diagnostic failure", async () => {
		const failure = new Error("private output unavailable");
		const progressFlushed = {
			released: Promise.withResolvers<undefined>(),
			started: Promise.withResolvers<undefined>(),
		};
		const progress = {
			flush: async () => {
				progressFlushed.started.resolve();
				await progressFlushed.released.promise;
			},
			log: (message: string) => {
				expect.unreachable(message);
			},
		};
		const diagnostics = {
			flush: async () => {
				await Promise.resolve();
				throw failure;
			},
			reportError: (message: string) => {
				expect.unreachable(message);
			},
		};
		const flushed = flushRunDiagnostics(diagnostics, progress);
		await progressFlushed.started.promise;

		expect(Bun.peek.status(flushed)).toBe("pending");
		progressFlushed.released.resolve();
		expect(flushed).rejects.toBe(failure);
	});
});
