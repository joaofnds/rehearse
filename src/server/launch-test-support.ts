import { join } from "node:path";

import type { LiveCorpusRoot } from "#benchmark/corpus-file";

import HeldLaunch from "./held-launch-test-support";
import type { Launcher } from "./launches";

const FAKE_LAUNCH_TIME = "2026-10-01T00:00:00.000Z";

const FAKE_LAUNCH_PID = 4242;

/**
 * A live install under a test's own directory, so a server under test never
 * reaches the operator's real one.
 */
function directoryLiveCorpus(directory: string): LiveCorpusRoot {
	return {
		backingRoot: join(directory, "live", ".agents"),
		kind: "live",
		root: join(directory, "live", ".claude"),
	};
}

const FAKE_LAUNCH_STARTED_AT = "Tue Sep 29 10:00:00 2026";

interface Launch {
	readonly argv: readonly string[];
	readonly logFile: string;
}

/** Captures each launch instead of starting a process. */
class FakeLauncher implements Launcher {
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

	public async startedAt(pid: number): Promise<string | undefined> {
		return await Promise.resolve(this.processes.get(pid));
	}

	public stop(pid: number): void {
		this.stopped.push(pid);
	}
}

export {
	FAKE_LAUNCH_TIME,
	FAKE_LAUNCH_PID,
	directoryLiveCorpus,
	FAKE_LAUNCH_STARTED_AT,
	FakeLauncher,
};
export type { Launch };
