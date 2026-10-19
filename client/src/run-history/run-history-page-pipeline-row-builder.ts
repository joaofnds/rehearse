import type { Immutable } from "#benchmark/contracts";
import {
	UNREAD_RUN_FIGURES,
	UNREAD_STALENESS,
} from "#client/test-support/run-figures";
import type { PipelineRunRow } from "#server/run-history";

const DEFAULT_PROGRESS_ELAPSED_MS = 9000;

const DEFAULT_SESSION_SPENT_USD = 0.9;

type RunningProgress = Extract<
	PipelineRunRow["progress"],
	{ readonly state: "running" }
>;

class PipelineRunRowBuilder {
	public constructor(
		private readonly props: Immutable<Partial<PipelineRunRow>> = {},
	) {}

	public withExecutionProgress(
		props: Immutable<Partial<RunningProgress>> = {},
	): PipelineRunRowBuilder {
		const status = this.props.status ?? "RUNNING";

		return new PipelineRunRowBuilder({
			...this.props,
			caseId: this.props.caseId ?? "audit-log",
			corpusChangedDuringRun: this.props.corpusChangedDuringRun ?? false,
			progress:
				status === "RUNNING"
					? {
							...props,
							ceilingUsd: props.ceilingUsd,
							elapsedMs: props.elapsedMs ?? DEFAULT_PROGRESS_ELAPSED_MS,
							measuredAt: props.measuredAt ?? "2026-09-30T10:00:09.000Z",
							runSpentUsd: props.runSpentUsd,
							runTokens: props.runTokens,
							spendScope: props.spendScope ?? "this stage's session so far",
							spentUsd: props.spentUsd ?? DEFAULT_SESSION_SPENT_USD,
							stage: props.stage ?? "build",
							stageElapsedMs: props.stageElapsedMs,
							stageState: props.stageState ?? "session running",
							state: "running",
						}
					: { state: "recorded" },
			run: this.props.run ?? "2026-09-30T10-00-00.000Z",
			shortId: this.props.shortId ?? "r-0148",
			status,
		});
	}

	public build(): PipelineRunRow {
		const run = this.props.run ?? "2026-09-06T21-58-29.508Z";

		return {
			...UNREAD_RUN_FIGURES,
			caseId: "audit-log",
			checkpoints: [],
			corpusChangedDuringRun: false,
			corpusVersion: undefined,
			grade: undefined,
			kind: "run",
			launchId: undefined,
			links: [],
			progress: { state: "recorded" },
			recordId: `run:${run}`,
			run,
			shortId: undefined,
			stage: undefined,
			staleness: UNREAD_STALENESS,
			status: "COMPLETE",
			...this.props,
		};
	}
}

export { PipelineRunRowBuilder as default };
