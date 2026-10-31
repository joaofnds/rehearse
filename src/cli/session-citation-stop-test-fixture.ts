import { smokeAttempt } from "#benchmark/session-record-test-fixtures";

import type { PreparedSessionBoundary } from "./prepared-session-command";
import { FIRST_STOP_REQUEST_INDEX } from "./run-command-test-fixture";

/**
 * A prepared session boundary that fires the first stop registered with it as
 * the live citation map is read, which every rep awaits before its session,
 * and records each rep session it starts, tracked as a real attempt tracks
 * itself.
 */
class CitationStop {
	public readonly sessions: string[] = [];
	public readonly stops: (() => Promise<void>)[] = [];

	public readonly boundary: PreparedSessionBoundary = {
		readCitations: async () => {
			await this.stops[FIRST_STOP_REQUEST_INDEX]?.();

			return { home: "/home", roots: [] };
		},
		runAttempt: async (request) =>
			await request.inFlight.track(async () => {
				this.sessions.push(request.recordDirectory);

				return await Promise.resolve(smokeAttempt());
			}),
	};
}

export { CitationStop as default };
