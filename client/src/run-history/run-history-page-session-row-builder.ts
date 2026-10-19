import {
	UNREAD_SESSION_ATTEMPT_FIGURES,
	UNREAD_STALENESS,
} from "#client/test-support/run-figures";
import type { SessionAttemptRow } from "#server/run-history";

class SessionAttemptRowBuilder {
	public constructor(private readonly props: Partial<SessionAttemptRow> = {}) {}

	public build(): SessionAttemptRow {
		const uuid = this.props.uuid ?? "0f6b6f2a-0000-4000-8000-000000000009";
		return {
			...UNREAD_SESSION_ATTEMPT_FIGURES,
			caseId: "brief-reply",
			corpusVersion: undefined,
			kind: "session-attempt",
			links: [],
			recordId: `attempt:session:brief-reply/${uuid}`,
			shortId: undefined,
			staleness: UNREAD_STALENESS,
			status: "SUCCESSFUL",
			uuid,
			...this.props,
		};
	}
}

export { SessionAttemptRowBuilder as default };
