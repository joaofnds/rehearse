const STOPPED_PREFIX = "STOPPED:";

type StoppedStatus = `${typeof STOPPED_PREFIX}${string}`;

/**
 * The one place that writes a stopped run's status and reads its stage back.
 * This module has no imports, so the client imports it directly instead of
 * re-deriving the prefix on its own.
 */
function stoppedStatus(stage: string): StoppedStatus {
	return `${STOPPED_PREFIX}${stage}`;
}

function isStopped(status: string): status is StoppedStatus {
	return status.startsWith(STOPPED_PREFIX);
}

function stoppedStageOf(status: StoppedStatus): string {
	return status.slice(STOPPED_PREFIX.length);
}

const PAUSED_PREFIX = "PAUSED:";

type PausedStatus = `${typeof PAUSED_PREFIX}${string}`;

/** A paused run's status, naming the stage it paused after. */
function pausedStatus(stage: string): PausedStatus {
	return `${PAUSED_PREFIX}${stage}`;
}

function isPaused(status: string): status is PausedStatus {
	return status.startsWith(PAUSED_PREFIX);
}

/** The completed stage after which a paused process ended. */
function pausedStageOf(status: PausedStatus): string {
	return status.slice(PAUSED_PREFIX.length);
}

/** A run a signal ended, which the operator's Stop sends. */
const OPERATOR_STOPPED = "OPERATOR_STOPPED";

/** A browser launch whose command recorded the error it ended by. */
const LAUNCH_ENDED = "ENDED";

export {
	stoppedStatus,
	isStopped,
	stoppedStageOf,
	pausedStatus,
	isPaused,
	pausedStageOf,
	OPERATOR_STOPPED,
	LAUNCH_ENDED,
};
export type { StoppedStatus, PausedStatus };
