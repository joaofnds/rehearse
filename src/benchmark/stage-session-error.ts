import type { ProviderCall } from "./contracts";
import type { StageSessionResult } from "./stage-session-contract";

function reasonOf(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}

/**
 * What a stage session spent up to a point: the calls it made, none before
 * its first, and their spend, unknown when the last call reported none,
 * since a resumed call's total covers the calls before it and the calls'
 * sum would otherwise read as the whole.
 */
interface SessionSpend {
	readonly providerCalls: readonly ProviderCall[];
	readonly costUsd: number | undefined;
}

interface StageSessionFailure extends SessionSpend {
	readonly cause: unknown;
	readonly sessionId: string;
}

/**
 * A stage session that failed, carrying what it spent up to the failure and
 * the session whose transcript holds what it did.
 */
class StageSessionError extends Error {
	public readonly providerCalls: readonly ProviderCall[];
	public readonly costUsd: number | undefined;
	public readonly sessionId: string;

	public constructor(props: StageSessionFailure, prefix = "") {
		super(`${prefix}${reasonOf(props.cause)}`, { cause: props.cause });
		this.name = "StageSessionError";
		this.providerCalls = props.providerCalls;
		this.costUsd = props.costUsd;
		this.sessionId = props.sessionId;
	}
}

/** The session a failed stage ran, whether it ended or threw, if it started. */
function failedStageSessionId(
	session: StageSessionResult | undefined,
	failure: Readonly<Error>,
): string | undefined {
	if (session !== undefined) {
		return session.transcript.sessionId;
	}

	return failure instanceof StageSessionError ? failure.sessionId : undefined;
}

export { StageSessionError as default, failedStageSessionId };
export type { SessionSpend, StageSessionFailure };
