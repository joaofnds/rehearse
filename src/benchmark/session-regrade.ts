import type { SessionCase } from "./case";
import type { Immutable } from "./contracts";
import type { SessionAttemptId } from "./run-layout";
import type { SessionAttemptRecord } from "./session-record";

/**
 * A regraded check carries a third status the recorded `checks` array cannot:
 * evidence the saved attempt does not hold is neither a pass nor a failure,
 * and recording it as either would put a grade on the record that nothing was
 * read to produce.
 */
export interface RegradedCheck {
	readonly kind: string;
	readonly status: "PASS" | "FAIL" | "UNAVAILABLE";
	readonly detail: string;
}

export interface RegradeRequest {
	readonly attemptId: Immutable<SessionAttemptId>;
	readonly record: Immutable<SessionAttemptRecord>;
	readonly attemptDirectory: string;
	readonly sessionCase: Immutable<SessionCase>;
}

export interface Assessment {
	readonly checks: readonly RegradedCheck[];
}

export function regradeAttempt(
	request: Immutable<RegradeRequest>,
): Promise<Assessment> {
	return Promise.resolve({
		checks: request.sessionCase.checks.map((check) => ({
			kind: check.kind,
			status: "UNAVAILABLE" as const,
			detail:
				"the attempt recorded no readable transcript, so its tool uses cannot be counted",
		})),
	});
}
