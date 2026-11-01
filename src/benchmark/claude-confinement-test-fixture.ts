import { afterEach } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import serialMap from "./serial-map";
import { TestResources } from "./test-support";

type SessionAdapter = "json" | "stream" | "attempt" | "probe";
const EXECUTABLE_MODE = 0o755;
const FIXTURE_TIMEOUT_MS = 4000;
const FIXTURE_STOP_TIMEOUT_MS = 1000;
const COLLECTION_START_INDEX = 0;
const EXIT_POLL_COUNT = 100;
const EXIT_POLL_MS = 10;
const PID_SCHEMA = z.coerce.number().int().positive();
const CHECK_SIGNAL = 0;

type FixtureProcess = Bun.Subprocess<"ignore", "pipe", "pipe">;

interface FixtureOutput {
	readonly exited: Promise<number>;
	readonly stdout: ReadableStream<Uint8Array>;
	readonly stderr: ReadableStream<Uint8Array>;
}

interface ConfinementWorkspace {
	readonly resources: TestResources;
	readonly create: () => Promise<ClaudeConfinementFixture>;
}

interface SessionBoundaryResult {
	readonly exitCode: number;
	readonly started: boolean;
	readonly stdout: string;
	readonly stderr: string;
}

interface SessionBoundaryOptions {
	readonly adapter?: SessionAdapter;
	readonly confined?: string;
	readonly childConfined?: string;
	readonly probeModel?: string;
}

class ClaudeConfinementFixture {
	private child: FixtureProcess | undefined = undefined;
	public constructor(public readonly directory: string) {}

	public static forEachTest(): ConfinementWorkspace {
		const resources = new TestResources();
		const fixtures: ClaudeConfinementFixture[] = [];
		afterEach(async () => {
			await Promise.all(
				fixtures.splice(COLLECTION_START_INDEX).map(async (fixture) => {
					await fixture.close();
				}),
			);
		});
		resources.registerCleanup();

		return {
			create: async () => {
				const fixture = await ClaudeConfinementFixture.create(resources);
				fixtures.push(fixture);
				return fixture;
			},
			resources,
		};
	}

	public static async create(
		resources: Readonly<TestResources>,
	): Promise<ClaudeConfinementFixture> {
		const directory = await resources.createTemporaryDirectory(
			"rehearse-spawn-guard-",
		);
		const fixture = new ClaudeConfinementFixture(directory);
		await fixture.setProviderScript(
			`printf started > "$REHEARSE_GUARD_SENTINEL"\nprintf '%s\\n' '{"type":"result","is_error":false}'\n`,
		);

		return fixture;
	}

	public async setProviderScript(body: string): Promise<void> {
		const executable = join(this.directory, "claude");
		await Bun.write(
			executable,
			`#!/bin/sh\nprintf '%s' "$$" > "$REHEARSE_GUARD_PROVIDER_PID"\n${body}`,
		);
		await chmod(executable, EXECUTABLE_MODE);
	}

	public async run(
		args: readonly string[],
		{
			adapter = "json",
			confined,
			childConfined,
			probeModel = "sonnet",
		}: SessionBoundaryOptions = {},
	): Promise<SessionBoundaryResult> {
		const sentinel = join(this.directory, "started");
		const script = `
import { runJsonSession, runStreamedSession } from ${JSON.stringify(new URL("claude.ts", import.meta.url).pathname)};
import runAttempt from ${JSON.stringify(new URL("../cli/session-claude-runner.ts", import.meta.url).pathname)};
import { exitCodeFor } from ${JSON.stringify(new URL("exit-codes.ts", import.meta.url).pathname)};
import { defaultModelProbe } from ${JSON.stringify(new URL("model-preflight.ts", import.meta.url).pathname)};
import { killActiveCommands } from ${JSON.stringify(new URL("command.ts", import.meta.url).pathname)};
process.once("SIGTERM", async () => { await killActiveCommands(); process.exit(1); });
const adapters = { json: runJsonSession, stream: runStreamedSession, attempt: runAttempt, probe: () => defaultModelProbe(${JSON.stringify(probeModel)})() };
try { console.log(await adapters[${JSON.stringify(adapter)}](${JSON.stringify(["claude", ...args])}, ${JSON.stringify(this.directory)}, ${JSON.stringify({ env: { REHEARSE_CONFINED: childConfined } })})); }
catch (error) { console.error(error.message); process.exitCode = exitCodeFor(error); }
finally { await killActiveCommands(); }
`;
		const child = Bun.spawn([process.execPath, "--eval", script], {
			cwd: this.directory,
			env: {
				...Bun.env,
				PATH: `${this.directory}:${Bun.env["PATH"] ?? ""}`,
				REHEARSE_CONFINED: confined,
				REHEARSE_GUARD_PROVIDER_PID: join(this.directory, "provider-pid"),
				REHEARSE_GUARD_SENTINEL: sentinel,
			},
			killSignal: "SIGTERM",
			stderr: "pipe",
			stdin: "ignore",
			stdout: "pipe",
			timeout: FIXTURE_TIMEOUT_MS,
		});
		this.child = child;
		try {
			return await fixtureResult(child, sentinel);
		} finally {
			await this.close();
		}
	}

	public async close(): Promise<void> {
		await stopProviderGroup(join(this.directory, "provider-pid"));
		const { child } = this;
		if (child === undefined || child.exitCode !== null) {
			return;
		}
		const timeout = setTimeout(() => {
			child.kill("SIGKILL");
		}, FIXTURE_STOP_TIMEOUT_MS);
		try {
			child.kill("SIGTERM");
			await child.exited;
		} finally {
			clearTimeout(timeout);
		}
	}
}

async function stopProviderGroup(pidFile: string): Promise<void> {
	if (!(await Bun.file(pidFile).exists())) {
		return;
	}
	const pid = PID_SCHEMA.parse(await Bun.file(pidFile).text());
	if (!signalGroup(pid, "SIGKILL")) {
		return;
	}
	const probes = serialMap(
		Array.from({ length: EXIT_POLL_COUNT }).values(),
		async () => {
			await Bun.sleep(EXIT_POLL_MS);
			return signalGroup(pid, CHECK_SIGNAL);
		},
	);
	for await (const alive of probes) {
		if (!alive) {
			return;
		}
	}
	throw new Error(`Provider fixture group ${pid} did not exit`);
}

function signalGroup(
	pid: number,
	signal: NodeJS.Signals | typeof CHECK_SIGNAL,
): boolean {
	try {
		process.kill(-pid, signal);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ESRCH") {
			return false;
		}
		throw error;
	}
}

async function fixtureResult(
	child: FixtureOutput,
	sentinel: string,
): Promise<SessionBoundaryResult> {
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);

	return {
		exitCode,
		started: await Bun.file(sentinel).exists(),
		stderr,
		stdout,
	};
}

export { ClaudeConfinementFixture as default };
export type { SessionAdapter };
