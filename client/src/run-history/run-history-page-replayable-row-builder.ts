import { unversionedStaleness } from "#client/test-support/run-figures";
import type { PipelineRunRow } from "#server/run-history";

import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";

class ReplayableRowBuilder {
	public constructor(private readonly props: Partial<PipelineRunRow> = {}) {}

	public build(): PipelineRunRow {
		return new PipelineRunRowBuilder({
			replayableStages: [],
			shortId: "r1",
			stageGrades: {
				grades: ["plan", "build", "review"].map((stage) => ({
					grade: { reasons: ["not read by this test"], state: "unavailable" },
					stage,
					status: "graded",
				})),
				state: "available",
			},
			staleness: unversionedStaleness({ causes: [], stale: false }),
			...this.props,
		}).build();
	}
}

export { ReplayableRowBuilder as default };
