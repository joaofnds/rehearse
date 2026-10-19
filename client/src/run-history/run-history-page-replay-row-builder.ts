import {
	UNREAD_REPLAY_FIGURES,
	UNREAD_STALENESS,
} from "#client/test-support/run-figures";
import type { ReplayRow } from "#server/run-history";

class ReplayRowBuilder {
	public constructor(private readonly props: Partial<ReplayRow> = {}) {}

	public build(): ReplayRow {
		const timestamp = this.props.timestamp ?? "2026-09-06T22-33-15.057Z";
		return {
			...UNREAD_REPLAY_FIGURES,
			attempt: undefined,
			caseId: "audit-log",
			checkpointShortId: undefined,
			corpusVersion: undefined,
			grade: "B+",
			kind: "replay",
			lineage: "60758c",
			links: [],
			recordId: `attempt:stage:60758c/${timestamp}`,
			shortId: undefined,
			stage: "build",
			staleness: UNREAD_STALENESS,
			status: "CONTINUE",
			timestamp,
			...this.props,
		};
	}
}

export { ReplayRowBuilder as default };
