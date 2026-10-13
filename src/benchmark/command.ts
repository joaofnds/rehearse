import { stat } from "node:fs/promises";
import { CommandSilenceError } from "./command-silence-error";
import { MissingDirectoryError } from "./missing-directory-error";
import { COMMAND_TIMEOUT_MS } from "./config";

/**
 * A command ends at its wall limit, `timeoutMs` or the default, or, when given
 * a silence limit instead, only once its stdout stays silent that long.
 */
type CommandLimit =
	| {
			readonly timeoutMs?: number | undefined;
			readonly silenceLimitMs?: undefined;
	  }
	| { readonly silenceLimitMs: number; readonly timeoutMs?: undefined };

type CommandOptions = CommandLimit & {
	readonly env?: Readonly<Record<string, string>> | undefined;
	readonly input?: string | undefined;
	/** Called with each stdout line as it arrives, the last one unterminated. */
	readonly onLine?: ((line: string) => void) | undefined;
};

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

interface OutputReader {
	readonly onChunk: () => void;
	readonly onLine?: ((line: string) => void) | undefined;
}

/**
 * The whole stream as text, telling `onChunk` each time a chunk arrives and
 * handing each line to `onLine` on the way.
 */
async function readLines(
	stream: ReadableStream<Uint8Array>,
	reader: OutputReader,
): Promise<string> {
	const decoder = new TextDecoder();
	let text = "";
	let lineStart = 0;
	for await (const chunk of stream) {
		reader.onChunk();
		text += decoder.decode(chunk, { stream: true });
		let lineEnd = text.indexOf("\n", lineStart);
		while (lineEnd !== -1) {
			reader.onLine?.(text.slice(lineStart, lineEnd));
			lineStart = lineEnd + 1;
			lineEnd = text.indexOf("\n", lineStart);
		}
	}
	text += decoder.decode();
	if (lineStart < text.length) {
		reader.onLine?.(text.slice(lineStart));
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

interface RunningProcess extends ReadableProcess {
	readonly stderr: ReadableStream<Uint8Array>;
	readonly exitCode: number | null;
}

/**
 * A failed reader ends the command, which would otherwise run on past its
 * timeout and out of reach of killActiveCommands.
 */
async function readLinesOrKill(
	child: ReadableProcess,
	reader: OutputReader,
): Promise<string> {
	try {
		return await readLines(child.stdout, reader);
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
	const child = await spawnIn(command, cwd, options);
	activeProcesses.add(child);
	try {
		return await awaitOutput(command, child, options);
	} finally {
		activeProcesses.delete(child);
	}
}

type SpawnedCommand = Bun.Subprocess<"ignore" | Blob, "pipe", "pipe">;

/** Bun names the command, not the directory, when the directory is missing. */
async function spawnIn(
	command: readonly string[],
	cwd: string,
	options: CommandOptions,
): Promise<SpawnedCommand> {
	try {
		return Bun.spawn([...command], {
			cwd,
			env: { ...Bun.env, ...options.env },
			stdin: options.input === undefined ? "ignore" : new Blob([options.input]),
			stdout: "pipe",
			stderr: "pipe",
			detached: true,
		});
	} catch (error) {
		if (await isMissing(cwd)) {
			throw new MissingDirectoryError(cwd, { cause: error });
		}

		throw error;
	}
}

async function isMissing(path: string): Promise<boolean> {
	try {
		await stat(path);

		return false;
	} catch (error) {
		return error instanceof Error && "code" in error && error.code === "ENOENT";
	}
}

async function awaitOutput(
	command: readonly string[],
	child: RunningProcess,
	options: CommandOptions,
): Promise<string> {
	let silenced = false;
	const timeout = setTimeout(
		() => {
			// A command that already exited has finished, whatever a process it
			// left behind still holds open.
			silenced =
				options.silenceLimitMs !== undefined && child.exitCode === null;
			killProcessGroup(child);
		},
		options.silenceLimitMs ?? options.timeoutMs ?? COMMAND_TIMEOUT_MS,
	);

	try {
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			readLinesOrKill(child, {
				onChunk: () => {
					if (options.silenceLimitMs !== undefined) {
						timeout.refresh();
					}
				},
				onLine: options.onLine,
			}),
			new Response(child.stderr).text(),
		]);

		if (silenced && options.silenceLimitMs !== undefined) {
			throw new CommandSilenceError(command, options.silenceLimitMs, stderr);
		}

		if (exitCode !== 0) {
			throw new CommandError(command, exitCode, stdout, stderr);
		}

		return stdout;
	} finally {
		clearTimeout(timeout);
	}
}

export async function killActiveCommands(): Promise<void> {
	const children = [...activeProcesses];
	for (const child of children) {
		killProcessGroup(child);
	}

	await Promise.allSettled(children.map((child) => child.exited));
}
