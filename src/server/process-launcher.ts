import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { CONTROL_DIR } from "#benchmark/config";
import type { Launcher } from "./launches";

/**
 * The knobs a case declares, each of which the CLI takes from the environment
 * ahead of the declaration. A shell that started `serve` can still export one
 * from an earlier CLI session, and a browser launch runs the case as declared
 * (doc-173 Decision 10), so none of them reaches the child.
 */
const DECLARED_KNOB_VARIABLES = new Set([
	"BENCHMARK_CASE",
	"BENCHMARK_EFFORT",
	"BENCHMARK_JUDGE_EFFORT",
	"BENCHMARK_JUDGE_MODEL",
	"BENCHMARK_MINIMUM_GRADE",
	"BENCHMARK_MODEL",
	"BENCHMARK_PIPELINE",
	"BENCHMARK_SESSION_BUDGET_USD",
	"BENCHMARK_TARGET_DIR",
]);

/**
 * Starts `command` followed by a launch's arguments as a detached child: its
 * own session, so stopping or restarting the server signals nothing it
 * started, and output to the launch's log file rather than to pipes the
 * server would have to keep open. The server keeps no handle on the child,
 * because the launch record holds its pid. The child gets `env` without the
 * declared knobs.
 */
export function processLauncher(
	command: readonly string[],
	env: Readonly<Record<string, string | undefined>>,
): Launcher {
	return {
		launch: async (argv, logFile) => {
			await mkdir(dirname(logFile), { recursive: true });
			const log = await open(logFile, "a");
			try {
				const child = Bun.spawn([...command, ...argv], {
					cwd: CONTROL_DIR,
					env: Object.fromEntries(
						Object.entries(env).filter(
							([name]) => !DECLARED_KNOB_VARIABLES.has(name),
						),
					),
					detached: true,
					stdio: ["ignore", log.fd, log.fd],
				});
				child.unref();

				return child.pid;
			} finally {
				await log.close();
			}
		},
		startedAt: async (pid) => {
			// Read in one timezone and locale, so a server restarted from another
			// shell compares the same text the launch recorded.
			const table = await Bun.$`ps -o lstart= -p ${pid}`
				.env({ ...Bun.env, TZ: "UTC", LC_ALL: "C" })
				.quiet()
				.nothrow();

			return table.exitCode === 0 ? table.text().trim() : undefined;
		},
		stop: (pid) => {
			try {
				process.kill(pid, "SIGTERM");
			} catch (error) {
				// It ended between the check and the signal, which is the stop.
				// Any other refusal means nothing was signalled.
				if (
					!(error instanceof Error && "code" in error && error.code === "ESRCH")
				) {
					throw error;
				}
			}
		},
	};
}
