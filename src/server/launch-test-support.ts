import { HeldLaunch } from "./held-launch-test-support";
import type { Launcher } from "./launches";

export const FAKE_LAUNCH_PID = 4242;

export const FAKE_LAUNCH_STARTED_AT = "Tue Sep 29 10:00:00 2026";

export interface Launch {
	readonly argv: readonly string[];
	readonly logFile: string;
}

/** Captures each launch instead of starting a process. */
export class FakeLauncher implements Launcher {
	public readonly launches: Launch[] = [];

	#held: HeldLaunch | undefined;

	#failure: string | undefined;

	public async launch(
		argv: readonly string[],
		logFile: string,
	): Promise<number> {
		const failure = this.#failure;
		this.#failure = undefined;
		if (failure !== undefined) {
			throw new Error(failure);
		}

		this.launches.push({ argv, logFile });
		const held = this.#held;
		this.#held = undefined;
		if (held !== undefined) {
			await held.hold();
		}

		return FAKE_LAUNCH_PID;
	}

	/**
	 * Holds the next launch until it is released, so a test can send a
	 * request while an earlier one is still starting.
	 */
	public holdNextLaunch(): HeldLaunch {
		const held = new HeldLaunch();
		this.#held = held;

		return held;
	}

	/** Fails the next launch with this reason, as a spawn that cannot start. */
	public failNextLaunch(reason: string): void {
		this.#failure = reason;
	}

	/** The process table: each live pid and when its process started. */
	public readonly processes = new Map([
		[FAKE_LAUNCH_PID, FAKE_LAUNCH_STARTED_AT],
	]);

	/** Each pid signalled to stop, in order. */
	public readonly stopped: number[] = [];

	public startedAt(pid: number): Promise<string | undefined> {
		return Promise.resolve(this.processes.get(pid));
	}

	public stop(pid: number): void {
		this.stopped.push(pid);
	}
}
