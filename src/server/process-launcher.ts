import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { CONTROL_DIR } from "#benchmark/config";
import type { Launcher } from "./launches";

/**
 * Starts `command` followed by a launch's arguments as a detached child: its
 * own session, so stopping or restarting the server signals nothing it
 * started, and output to the launch's log file rather than to pipes the
 * server would have to keep open. The server keeps no handle on the child,
 * because the launch record holds its pid.
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
					env: { ...env },
					detached: true,
					stdio: ["ignore", log.fd, log.fd],
				});
				child.unref();

				return child.pid;
			} finally {
				await log.close();
			}
		},
	};
}
