import {
	UNREAD_GROUP_FIGURES,
	UNREAD_STALENESS,
} from "#client/test-support/run-figures";
import type { ConfirmationGroupRow } from "#server/run-history";

class ConfirmationGroupRowBuilder {
	public constructor(
		private readonly props: Partial<ConfirmationGroupRow> = {},
	) {}

	public build(): ConfirmationGroupRow {
		const groupId = this.props.groupId ?? "group-0143";

		return {
			...UNREAD_GROUP_FIGURES,
			caseId: "audit-log",
			checkpoint: undefined,
			corpusVersion: undefined,
			groupId,
			kind: "group",
			links: [],
			mode: "session",
			recordId: `group:${groupId}`,
			repAttempts: [],
			reps: 2,
			shortId: undefined,
			staleness: UNREAD_STALENESS,
			...this.props,
		};
	}
}

export { ConfirmationGroupRowBuilder as default };
