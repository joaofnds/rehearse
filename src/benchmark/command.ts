import { COMMAND_TIMEOUT_MS } from "./config";

interface CommandOptions {
	readonly env?: Readonly<Record<string, string>> | undefined;
	readonly input?: string | undefined;
	readonly timeoutMs?: number | undefined;
	/** Called with each stdout line as it arrives, the last one unterminated. */
	readonly onLine?: ((line: string) => void) | undefined;
}

export class CommandError extends Error {
	public override name = "CommandError";

	public constructor(
		public readonly command: readonly string[],
		public readonly exitCode: number,
		public readonly stdout: string,
		public readonly stderr: string,
	) {
		super(
			`Command failed (${exitCode}): ${command.join(" ")}\n${stderr || stdout}`,
		);
	}
}

/** The whole stream as text, handing each line to `onLine` on the way. */
async function readLines(
	stream: ReadableStream<Uint8Array>,
	onLine: (line: string) => void,
): Promise<string> {
	const decoder = new TextDecoder();
	let text = "";
	let lineStart = 0;
	for await (const chunk of stream) {
		text += decoder.decode(chunk, { stream: true });
		let lineEnd = text.indexOf("\n", lineStart);
		while (lineEnd !== -1) {
			onLine(text.slice(lineStart, lineEnd));
			lineStart = lineEnd + 1;
			lineEnd = text.indexOf("\n", lineStart);
		}
	}
	text += decoder.decode();
	if (lineStart < text.length) {
		onLine(text.slice(lineStart));
	}

	return text;
}

const activeProcesses = new Set<ReturnType<typeof Bun.spawn>>();

interface KillableProcess {
	readonly pid: number;
	readonly kill: (signal: NodeJS.Signals) => void;
}

function killProcessGroup(child: KillableProcess): void {
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch {
		child.kill("SIGKILL");
	}
}

interface ReadableProcess extends KillableProcess {
	readonly stdout: ReadableStream<Uint8Array>;
	readonly exited: Promise<number>;
}

/**
 * A failed reader ends the command, which would otherwise run on past its
 * timeout and out of reach of killActiveCommands.
 */
async function readLinesOrKill(
	child: ReadableProcess,
	onLine: (line: string) => void,
): Promise<string> {
	try {
		return await readLines(child.stdout, onLine);
	} catch (error) {
		killProcessGroup(child);
		await child.exited;
		throw error;
	}
}

export async function runCommand(
	command: readonly string[],
	cwd: string,
	options: CommandOptions = {},
): Promise<string> {
	const child = Bun.spawn([...command], {
		cwd,
		env: { ...Bun.env, ...options.env },
		stdin: options.input === undefined ? "ignore" : new Blob([options.input]),
		stdout: "pipe",
		stderr: "pipe",
		detached: true,
	});
	activeProcesses.add(child);
	const timeout = setTimeout(() => {
		killProcessGroup(child);
	}, options.timeoutMs ?? COMMAND_TIMEOUT_MS);

	try {
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			options.onLine === undefined
				? new Response(child.stdout).text()
				: readLinesOrKill(child, options.onLine),
			new Response(child.stderr).text(),
		]);

		if (exitCode !== 0) {
			throw new CommandError(command, exitCode, stdout, stderr);
		}

		return stdout;
	} finally {
		clearTimeout(timeout);
		activeProcesses.delete(child);
	}
}

export async function killActiveCommands(): Promise<void> {
	const children = [...activeProcesses];
	for (const child of children) {
		killProcessGroup(child);
	}

	await Promise.allSettled(children.map((child) => child.exited));
}
