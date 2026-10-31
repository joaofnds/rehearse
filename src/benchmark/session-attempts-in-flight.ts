import { once } from "node:events";

import { operatorStopRecord } from "./operator-stop";
import type { AttemptsInFlight } from "./session-attempt-preparation-contract";

const NO_ATTEMPTS = 0;

/**
 * The session attempts one command has under way. An operator stop closes it
 * before it kills their provider commands, so an attempt that has not begun
 * never begins and one still preparing never starts a paid session the kill
 * has already passed, and the stop then waits
 * for each attempt to record what its killed session wrote and remove what it
 * left in the user's projects directory before the process exits. The stop
 * records itself in every attempt record claimed, so an attempt that outlives
 * the wait is still read as stopped.
 */
class SessionAttemptsInFlight implements AttemptsInFlight {
	private readonly running = new Set<Promise<unknown>>();
	private readonly stopFiles = new Set<string>();
	private stopSignal: NodeJS.Signals | undefined = undefined;

	public async track<Result>(start: () => Promise<Result>): Promise<Result> {
		this.assertOpen();
		const attempt = start();
		this.running.add(attempt);
		try {
			return await attempt;
		} finally {
			this.running.delete(attempt);
		}
	}

	public async claimRecord(operatorStopFile: string): Promise<void> {
		this.stopFiles.add(operatorStopFile);
		if (this.stopSignal !== undefined) {
			await Bun.write(operatorStopFile, operatorStopRecord(this.stopSignal));
		}
	}

	public releaseRecord(operatorStopFile: string): void {
		this.stopFiles.delete(operatorStopFile);
	}

	public async close(signal: NodeJS.Signals): Promise<void> {
		this.stopSignal = signal;

		await Promise.all(
			[...this.stopFiles].map(
				async (file) => await Bun.write(file, operatorStopRecord(signal)),
			),
		);
	}

	public stoppedBy(): NodeJS.Signals | undefined {
		return this.stopSignal;
	}

	public assertOpen(): void {
		if (this.stopSignal !== undefined) {
			throw new Error(
				"The operator stopped the run before this attempt started its session.",
			);
		}
	}

	/** Resolves once no attempt is under way, or at the bound with them left. */
	public async settled(boundMs: number): Promise<void> {
		await Promise.race([
			this.drained(),
			once(AbortSignal.timeout(boundMs), "abort"),
		]);
	}

	private async drained(): Promise<void> {
		if (this.running.size === NO_ATTEMPTS) {
			return;
		}

		await Promise.allSettled(this.running);
		await this.drained();
	}
}

export { SessionAttemptsInFlight as default };
