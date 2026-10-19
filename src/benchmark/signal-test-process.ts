import { expect } from "bun:test";

interface SignalResult {
	readonly code: number;
	readonly stderr: string;
	readonly stdout: string;
}

const CHILD_EXIT_TIMEOUT_MS = 2000;

async function remainingOutput(
	stream: ReadableStream<Uint8Array>,
): Promise<string> {
	const decoder = new TextDecoder();
	const parts: string[] = [];
	for await (const chunk of stream) {
		parts.push(decoder.decode(chunk, { stream: true }));
	}
	parts.push(decoder.decode());
	return parts.join("");
}

class SignalTestProcess {
	private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
	private readonly stderr: Promise<string>;

	private constructor(
		private readonly child: Bun.Subprocess<"pipe", "pipe", "pipe">,
	) {
		this.reader = child.stdout.getReader();
		this.stderr = new Response(child.stderr).text();
	}

	public static start(program: string): SignalTestProcess {
		const child = Bun.spawn([process.execPath, "--eval", program], {
			env: { ...Bun.env },
			killSignal: "SIGKILL",
			stderr: "pipe",
			stdin: "pipe",
			stdout: "pipe",
			timeout: CHILD_EXIT_TIMEOUT_MS,
		});
		return new SignalTestProcess(child);
	}

	public async expectPhase(phase: string): Promise<void> {
		const message = await this.reader.read();
		expect(new TextDecoder().decode(message.value)).toBe(phase);
	}

	public async signalAfter(
		phase: string,
		signal: NodeJS.Signals,
	): Promise<void> {
		await this.expectPhase(phase);
		this.child.kill(signal);
	}

	public async releaseCleanup(): Promise<void> {
		await this.child.stdin.write("release\n");
		await this.child.stdin.end();
	}

	public async result(): Promise<SignalResult> {
		this.reader.releaseLock();
		const [code, stdout, stderr] = await Promise.all([
			this.child.exited,
			remainingOutput(this.child.stdout),
			this.stderr,
		]);
		return { code, stderr, stdout };
	}

	public async close(): Promise<void> {
		if (this.child.exitCode === null) {
			this.child.kill("SIGKILL");
		}
		await this.child.exited;
	}
}

export { SignalTestProcess as default };
export type { SignalResult };
