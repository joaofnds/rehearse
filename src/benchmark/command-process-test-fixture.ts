import { afterEach } from "bun:test";

import { CommandError, runCommand } from "./command";

const FAILED_COMMAND_EXIT_CODE = 1;
const INITIAL_SLEEPER_COUNT = 0;
const RESOURCE_DRAIN_START_INDEX = 0;
const PROCESS_ID_FIELD_WIDTH = 7;
const SLEEPER_COUNT_FIELD_WIDTH = 3;
const SLEEPER_PROCESS_COUNT_INCREMENT = 1;
class CommandProcesses {
	#sleepers = INITIAL_SLEEPER_COUNT;
	readonly #spawnedSleepers: string[] = [];
	public static forEachTest(): CommandProcesses {
		const fixture = new CommandProcesses();
		afterEach(async () => {
			await fixture.cleanup();
		});

		return fixture;
	}
	public static async matches(pattern: string): Promise<string> {
		try {
			const matches = await runCommand(["pgrep", "-f", pattern], process.cwd());
			return matches.trim();
		} catch (error) {
			if (
				error instanceof CommandError &&
				error.exitCode === FAILED_COMMAND_EXIT_CODE
			) {
				return "";
			}

			throw error;
		}
	}
	public static async *processMatches(pattern: string): AsyncGenerator<string> {
		while (true) {
			yield CommandProcesses.matches(pattern);
		}
	}
	public uniqueSleeper(): string {
		this.#sleepers += SLEEPER_PROCESS_COUNT_INCREMENT;

		const pid = String(process.pid).padStart(PROCESS_ID_FIELD_WIDTH, "0");
		const run = String(this.#sleepers).padStart(SLEEPER_COUNT_FIELD_WIDTH, "0");

		const sleeper = `sleep ${pid}${run}`;
		this.#spawnedSleepers.push(sleeper);

		return sleeper;
	}
	private async cleanup(): Promise<void> {
		const spawned = this.#spawnedSleepers.splice(RESOURCE_DRAIN_START_INDEX);
		await Promise.allSettled(
			spawned.map(
				async (sleeper) =>
					await runCommand(["pkill", "-f", sleeper], process.cwd()),
			),
		);
	}
}
export { CommandProcesses as default };
