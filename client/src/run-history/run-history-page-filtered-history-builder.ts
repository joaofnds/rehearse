import { unversionedStaleness } from "#client/test-support/run-figures";
import type { RowStaleness } from "#server/run-history";

import ConfirmationGroupRowBuilder from "./run-history-page-group-row-builder";
import LaunchRowBuilder from "./run-history-page-launch-row-builder";
import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
import ReplayRowBuilder from "./run-history-page-replay-row-builder";
import SessionAttemptRowBuilder from "./run-history-page-session-row-builder";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const FINISHED = "2026-10-01T00-00-00.000Z";

const IN_FLIGHT = "2026-10-02T00-00-00.000Z";

const STOPPED = "2026-10-03T00-00-00.000Z";

const REPLAY = "2026-10-04T00-00-00.000Z";

const GROUP = "group-b";

const ATTEMPT = "0f6b6f2a-0000-4000-8000-000000000002";

const RUNNING_LAUNCH = "1aaaaaaa-0000-4000-8000-000000000000";

const STOPPED_LAUNCH = "2bbbbbbb-0000-4000-8000-000000000000";

const READ_AT = "2026-10-05T12:00:00.000Z";

const clean: RowStaleness = {
	causes: [],
	changedFiles: [],
	distance: { kind: "measured", versions: 0 },
	onlyCorpusFiles: false,
	stale: false,
	state: "available",
};

class FilteredHistoryBuilder {
	public constructor(
		private readonly props: Partial<RunHistoryResponseBody> = {},
	) {}

	public build(): RunHistoryResponseBody {
		return {
			launches: [
				new LaunchRowBuilder({
					caseId: "new-case",
					id: RUNNING_LAUNCH,
					launchedAt: READ_AT,
				}).build(),
				new LaunchRowBuilder({
					caseId: "old-case",
					id: STOPPED_LAUNCH,
					launchedAt: READ_AT,
					status: "OPERATOR_STOPPED",
				}).build(),
			],
			rows: [
				...FilteredHistoryBuilder.pipelineRows(),
				...FilteredHistoryBuilder.replayRows(),
				...FilteredHistoryBuilder.groupRows(),
				...FilteredHistoryBuilder.sessionRows(),
			],
			unreadable: [],
			...this.props,
		};
	}

	private static pipelineRows(): RunHistoryResponseBody["rows"] {
		return [
			new PipelineRunRowBuilder({
				corpusVersion: { digest: "a1c0ffee", kind: "version" },
				firedBlockers: { ids: ["invalid-stage-delivery"], state: "available" },
				run: FINISHED,
				staleness: clean,
			}).build(),
			new PipelineRunRowBuilder({
				caseId: "payments",
				corpusVersion: { digest: "b2c0ffee", kind: "version" },
				firedBlockers: {
					reasons: ["no stage record holds graded hard blockers"],
					state: "unavailable",
				},
				progress: {
					ceilingUsd: undefined,
					elapsedMs: 9000,
					measuredAt: READ_AT,
					runSpentUsd: 1.2,
					runTokens: undefined,
					spendScope: "this stage's session so far",
					spentUsd: 0.9,
					stage: "build",
					stageElapsedMs: undefined,
					stageState: "session running",
					state: "running",
				},
				run: IN_FLIGHT,
				staleness: unversionedStaleness({ causes: [], stale: false }),
				status: "RUNNING",
			}).build(),
			new PipelineRunRowBuilder({
				corpusVersion: { digest: "c3c0ffee", kind: "version" },
				firedBlockers: { ids: [], state: "available" },
				run: STOPPED,
				staleness: unversionedStaleness({ causes: [], stale: true }),
				status: "STOPPED:build",
			}).build(),
		];
	}

	private static replayRows(): RunHistoryResponseBody["rows"] {
		return [
			new ReplayRowBuilder({
				firedBlockers: { ids: ["contradicts-source"], state: "available" },
				grade: "D",
				recordId: `attempt:stage:60758c/${REPLAY}`,
				status: "STOP",
				timestamp: REPLAY,
			}).build(),
		];
	}

	private static groupRows(): RunHistoryResponseBody["rows"] {
		return [
			new ConfirmationGroupRowBuilder({
				caseId: "brief-reply",
				firedBlockers: { ids: ["material-decision-open"], state: "available" },
				groupId: GROUP,
				mode: "pipeline",
				recordId: `group:${GROUP}`,
			}).build(),
		];
	}

	private static sessionRows(): RunHistoryResponseBody["rows"] {
		return [
			new SessionAttemptRowBuilder({
				recordId: `attempt:session:brief-reply/${ATTEMPT}`,
				uuid: ATTEMPT,
			}).build(),
		];
	}
}

export {
	FilteredHistoryBuilder,
	FINISHED,
	IN_FLIGHT,
	STOPPED,
	REPLAY,
	GROUP,
	ATTEMPT,
	RUNNING_LAUNCH,
	STOPPED_LAUNCH,
};
