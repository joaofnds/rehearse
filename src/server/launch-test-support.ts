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

	public launch(argv: readonly string[], logFile: string): Promise<number> {
		this.launches.push({ argv, logFile });

		return Promise.resolve(FAKE_LAUNCH_PID);
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
