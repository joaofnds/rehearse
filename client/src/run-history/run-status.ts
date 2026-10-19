import {
	OPERATOR_STOPPED,
	isPaused,
	isStopped,
} from "#benchmark/stopped-status";
import type { PipelineRow } from "#client/shell/run-in-flight";
import type { StatusState } from "#client/system/components/status";

/**
 * A run's recorded status, read as the design system's status vocabulary. A
 * stopped run is never rendered as a failure (SPEC.md's third product rule):
 * it maps to `stopped`, the same neutral state the graph and the ledger use
 * for a step that fell below the minimum, not `interrupted` or a red glyph.
 * A run the operator stopped is not a failure either, and reads the same.
 * An unrecognized status reads as `pending` rather than guessing a glyph.
 */
function runStatusState(status: string): StatusState {
	if (isStopped(status) || status === OPERATOR_STOPPED) {
		return "stopped";
	}
	if (isPaused(status)) {
		return "paused";
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

/** Whether the process ended; continuing a paused run starts a new replay. */
function hasRunEnded({
	progress,
}: Pick<PipelineRow, "status" | "progress">): boolean {
	return progress.state !== "running";
}

/** Whether a stop record or the operator ended the run. */
function endedByStop(status: string): boolean {
	return isStopped(status) || status === OPERATOR_STOPPED;
}

export { endedByStop, hasRunEnded, runStatusState };
