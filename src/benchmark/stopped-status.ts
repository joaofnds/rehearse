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
