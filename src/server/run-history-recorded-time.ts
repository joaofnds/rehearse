import { unhandled } from "#benchmark/contracts";
import type { RunListingRow } from "#server/run-history-contract";

/**
 * The time a row's record says it ran, or undefined when its record holds
 * none: a run's name, a replay's timestamp, or the start time an attempt or
 * group recorded.
 */
function recordedTime(row: RunListingRow): string | undefined {
	switch (row.kind) {
		case "run": {
			return row.run;
		}
		case "replay": {
			return row.timestamp;
		}
		case "session-attempt":
		case "group": {
			return row.startedAt;
		}
		default: {
			return unhandled(row, "run history row kind");
		}
	}
}

export { recordedTime as default };
