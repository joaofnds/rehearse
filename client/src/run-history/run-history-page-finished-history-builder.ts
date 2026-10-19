import { unversionedStaleness } from "#client/test-support/run-figures";

import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
import type { RunHistoryResponse } from "./run-history-query";

class FinishedHistoryBuilder {
	public constructor(
		private readonly props: Partial<RunHistoryResponse> = {},
	) {}

	public build(): RunHistoryResponse {
		return {
			launches: [],
			rows: [
				new PipelineRunRowBuilder({
					corpusVersion: { digest: "a3a62f", kind: "version" },
					grade: "B",
					run: "2026-09-06T21-58-29.508Z",
					stage: "shape",
					staleness: unversionedStaleness({ causes: [], stale: true }),
					status: "STOPPED:build",
				}).build(),
				new PipelineRunRowBuilder({
					corpusVersion: { digest: "b1c2d3", kind: "version" },
					grade: "A",
					run: "2026-09-03T00-00-00.000Z",
					stage: "build",
					staleness: unversionedStaleness({ causes: [], stale: false }),
				}).build(),
			],
			unreadable: [],
			...this.props,
		};
	}
}

export { FinishedHistoryBuilder as default };
