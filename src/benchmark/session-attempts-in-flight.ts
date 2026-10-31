import { once } from "node:events";

import type { AttemptsInFlight } from "./session-attempt-preparation-contract";

const NO_ATTEMPTS = 0;

/**
 * The session attempts one command has under way. An operator stop closes it
 * before it kills their provider commands, so an attempt still preparing never
 * starts a paid session the kill has already passed, and the stop then waits
 * for each attempt to record what its killed session wrote and remove what it
 * left in the user's projects directory before the process exits.
 */
class SessionAttemptsInFlight implements AttemptsInFlight {
	private readonly running = new Set<Promise<unknown>>();
	private closed = false;

	public async track<Result>(attempt: Promise<Result>): Promise<Result> {
		this.running.add(attempt);
		try {
			return await attempt;
		} finally {
			this.running.delete(attempt);
		}
	}

	public close(): void {
		this.closed = true;
	}

	public assertOpen(): void {
		if (this.closed) {
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
