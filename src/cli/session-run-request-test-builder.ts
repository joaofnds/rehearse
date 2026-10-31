import type { Immutable } from "#benchmark/contracts";
import ABSENT_HOME, {
	attemptsInFlight,
} from "#benchmark/session-setup-test-fixtures";

import { SessionCaseBuilder, config } from "./session-case-test-fixture";
import type { SessionRunRequest } from "./session-run-contract";

/**
 * A debug run request whose every field a test does not vary takes a default,
 * so a new request field with a safe default changes this builder only.
 */
class SessionRunRequestBuilder {
	public constructor(
		private readonly overrides: Immutable<Partial<SessionRunRequest>> &
			Pick<
				SessionRunRequest,
				"projectsDirectory" | "runClaude" | "runsDirectory"
			>,
	) {}
	public build(): SessionRunRequest {
		return {
			config,
			environment: {},
			home: ABSENT_HOME,
			inFlight: attemptsInFlight(),
			sessionCase: new SessionCaseBuilder().build(),
			spendCeilingUsd: 100,
			...this.overrides,
		};
	}
}

export { SessionRunRequestBuilder as default };
