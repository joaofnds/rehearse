import { stat } from "node:fs/promises";

import withoutLaunchContext from "./claude-launch-environment";
import CommandOutputLines from "./command-output-lines";
import type { OutputReader } from "./command-output-lines";
import CommandSilenceError from "./command-silence-error";
import CommandsRefusedError from "./commands-refused-error";
import { COMMAND_TIMEOUT_MS } from "./config";
import MissingDirectoryError from "./missing-directory-error";

const SUCCESS_EXIT_CODE = 0;

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
	readonly env?: Readonly<Record<string, string | undefined>> | undefined;
	readonly input?: string | undefined;
	/** Called with each stdout line as it arrives, the last one unterminated. */
	readonly onLine?: ((line: string) => void) | undefined;
};

interface CommandFailure {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

class CommandError extends Error {
	public readonly exitCode: number;
	public readonly stdout: string;
	public readonly stderr: string;
	public override name = "CommandError";

	public constructor(
		public readonly command: readonly string[],
		{ exitCode, stdout, stderr }: CommandFailure,
	) {
		super(
			`Command failed (${exitCode}): ${command.join(" ")}\n${stderr || stdout}`,
		);
		this.exitCode = exitCode;
		this.stdout = stdout;
		this.stderr = stderr;
	}

	/** The same failure reporting `stdout` as its output. */
	public withStdout(stdout: string): CommandError {
		return new CommandError(this.command, {
			exitCode: this.exitCode,
			stderr: this.stderr,
			stdout,
		});
	}
}

async function readLines(
	stream: ReadableStream<Uint8Array>,
	reader: OutputReader,
): Promise<string> {
	const lines = new CommandOutputLines(reader);
	for await (const chunk of stream) {
		lines.append(chunk);
	}
	return lines.finish();
}

const activeProcesses = new Set<ReturnType<typeof Bun.spawn>>();
let refusing = false;

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

async function runCommand(
	command: readonly string[],
	cwd: string,
	options: CommandOptions = {},
): Promise<string> {
	if (refusing) {
		throw new CommandsRefusedError(command);
	}

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
			detached: true,
			env: { ...withoutLaunchContext(Bun.env), ...options.env },
			stderr: "pipe",
			stdin: options.input === undefined ? "ignore" : new Blob([options.input]),
			stdout: "pipe",
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

		if (exitCode !== SUCCESS_EXIT_CODE) {
			throw new CommandError(command, {
				exitCode,
				stderr,
				stdout,
			});
		}

		return stdout;
	} finally {
		clearTimeout(timeout);
	}
}

async function killActiveCommands(): Promise<void> {
	const children = [...activeProcesses];
	for (const child of children) {
		killProcessGroup(child);
	}

	await Promise.allSettled(children.map(async (child) => await child.exited));
}

/**
 * Refuses every command started from now on, so none can start after a stop
 * has killed the running ones and outlive the exit. Answers the release.
 */
function refuseCommands(): () => void {
	refusing = true;

	return () => {
		refusing = false;
	};
}

export { CommandError, runCommand, killActiveCommands, refuseCommands };

export type { CommandOptions };
