import { UNREAD_STALENESS } from "#client/test-support/run-figures";
import type { PipelineRunRow } from "#server/run-history";

import ConfirmationGroupRowBuilder from "./run-history-page-group-row-builder";
import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
import ReplayRowBuilder from "./run-history-page-replay-row-builder";
import SessionAttemptRowBuilder from "./run-history-page-session-row-builder";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

type CostAndTime = Pick<PipelineRunRow, "cost" | "wallTime">;

type ResourceFigures = CostAndTime &
	Pick<PipelineRunRow, "corpusVersion" | "links" | "shortId" | "staleness"> & {
		readonly caseId: string;
	};

const RUN = "2026-09-20T10-00-00.000Z";

const ATTEMPT = "0f6b6f2a-0000-4000-8000-000000000009";

const REPLAY = "2026-09-21T09-20-00.000Z";

const GROUP = "group-0143";

const SPENT = {
	missing: [],
	parts: [{ part: "build session", usd: 2.41 }],
	state: "available",
	usd: 2.41,
} satisfies PipelineRunRow["cost"];

const SIX_TWELVE: PipelineRunRow["wallTime"] = {
	ms: 372_000,
	state: "available",
};

class ResourceHistoryBuilder {
	public constructor(private readonly props: Partial<CostAndTime> = {}) {}

	public build(): RunHistoryResponseBody {
		const record: ResourceFigures = {
			cost: SPENT,
			wallTime: SIX_TWELVE,
			...this.props,
			caseId: "audit-log",
			corpusVersion: undefined,
			links: [],
			shortId: undefined,
			staleness: UNREAD_STALENESS,
		};

		return {
			launches: [],
			rows: [
				...ResourceHistoryBuilder.pipelineRows(record),
				...ResourceHistoryBuilder.sessionRows(record),
				...ResourceHistoryBuilder.replayRows(record),
				...ResourceHistoryBuilder.groupRows(record),
			],
			unreadable: [],
		};
	}

	private static pipelineRows(
		record: ResourceFigures,
	): RunHistoryResponseBody["rows"] {
		return [
			new PipelineRunRowBuilder({
				recordId: `run:${RUN}`,
				...record,
				checkpoints: [],
				corpusChangedDuringRun: false,
				grade: undefined,
				launchId: undefined,
				run: RUN,
				stage: "review",
				status: "COMPLETE",
			}).build(),
		];
	}

	private static sessionRows(
		record: ResourceFigures,
	): RunHistoryResponseBody["rows"] {
		return [
			new SessionAttemptRowBuilder({
				recordId: `attempt:session:audit-log/${ATTEMPT}`,
				...record,
				status: "SUCCESSFUL",
				uuid: ATTEMPT,
			}).build(),
		];
	}

	private static replayRows(
		record: ResourceFigures,
	): RunHistoryResponseBody["rows"] {
		return [
			new ReplayRowBuilder({
				recordId: `attempt:stage:60758c/${REPLAY}`,
				...record,
				attempt: undefined,
				checkpointShortId: undefined,
				grade: "B+",
				lineage: "60758c",
				stage: "build",
				status: "CONTINUE",
				timestamp: REPLAY,
			}).build(),
		];
	}

	private static groupRows(
		record: ResourceFigures,
	): RunHistoryResponseBody["rows"] {
		return [
			new ConfirmationGroupRowBuilder({
				recordId: `group:${GROUP}`,
				...record,
				checkpoint: undefined,
				groupId: GROUP,
				mode: "stage",
				repAttempts: [],
				reps: 3,
			}).build(),
		];
	}
}

export { ResourceHistoryBuilder, SPENT, SIX_TWELVE };
