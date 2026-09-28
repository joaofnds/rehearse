import type { Launcher } from "./launches";

export const FAKE_LAUNCH_PID = 4242;

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
}
