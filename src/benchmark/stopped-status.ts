const STOPPED_PREFIX = "STOPPED:";

export type StoppedStatus = `${typeof STOPPED_PREFIX}${string}`;

/**
 * The one place that writes a stopped run's status and reads its stage back.
 * This module has no imports, so the client imports it directly instead of
 * re-deriving the prefix on its own.
 */
export function stoppedStatus(stage: string): StoppedStatus {
	return `${STOPPED_PREFIX}${stage}`;
}

export function isStopped(status: string): status is StoppedStatus {
	return status.startsWith(STOPPED_PREFIX);
}

export function stoppedStageOf(status: StoppedStatus): string {
	return status.slice(STOPPED_PREFIX.length);
}

const PAUSED_PREFIX = "PAUSED:";

export type PausedStatus = `${typeof PAUSED_PREFIX}${string}`;

/** A paused run's status, naming the stage it paused after. */
export function pausedStatus(stage: string): PausedStatus {
	return `${PAUSED_PREFIX}${stage}`;
}

export function isPaused(status: string): status is PausedStatus {
	return status.startsWith(PAUSED_PREFIX);
}

/** A run a signal ended, which the operator's Stop sends. */
export const OPERATOR_STOPPED = "OPERATOR_STOPPED";
