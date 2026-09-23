import type { StatusState } from "#client/system/components/status";
import { isStopped } from "#benchmark/stopped-status";

/**
 * A run's recorded status, read as the design system's status vocabulary. A
 * stopped run is never rendered as a failure (SPEC.md's third product rule):
 * it maps to `stopped`, the same neutral state the graph and the ledger use
 * for a step that fell below the minimum, not `interrupted` or a red glyph.
 * An unrecognized status reads as `pending` rather than guessing a glyph.
 */
export function runStatusState(status: string): StatusState {
	if (isStopped(status)) {
		return "stopped";
	}

	switch (status) {
		case "COMPLETE": {
			return "accepted";
		}
		case "RUNNING": {
			return "running";
		}
		case "FAILED":
		case "INTERRUPTED": {
			return "interrupted";
		}
		case "AWAITING_HUMAN_REVIEW": {
			return "pending";
		}
		default: {
			return "pending";
		}
	}
}
