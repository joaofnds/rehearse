import type { Immutable } from "#benchmark/contracts";
import type { AnalysisReading } from "#server/root-cause-analyses";

import RecordedAnalysisBuilder from "./recorded-analysis-test-builder";
import { RUN } from "./run-detail-records";

class AnalysisReadingBuilder {
	public constructor(
		private readonly props: Immutable<Partial<AnalysisReading>> = {},
	) {}

	public withoutAnalysis(): AnalysisReadingBuilder {
		return new AnalysisReadingBuilder({
			...this.props,
			earlierCount: 0,
			newest: null,
		});
	}

	public withFailedAnswer(): AnalysisReadingBuilder {
		const {
			schemaVersion,
			run,
			model,
			capUsd,
			startedAt,
			durationMs,
			bundleDigest,
			bundleBytes,
		} = new RecordedAnalysisBuilder().build();

		return new AnalysisReadingBuilder({
			...this.props,
			newest: {
				bundleBytes,
				bundleDigest,
				capUsd,
				durationMs,
				model,
				outcome: "failed",
				payload: { rootCause: { stage: "deploy" } },
				reason: "the answer named a stage the run does not declare",
				run,
				schemaVersion,
				startedAt,
			},
		});
	}

	public build(): AnalysisReading {
		return {
			earlierCount: 1,
			newest: new RecordedAnalysisBuilder().build(),
			request: { capUsd: 1, model: "sonnet", refusal: null },
			run: RUN,
			unreadable: [],
			...this.props,
		};
	}
}

export { AnalysisReadingBuilder as default };
