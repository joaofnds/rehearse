import type { Immutable } from "#benchmark/contracts";
import { unversionedStaleness } from "#client/test-support/run-figures";

import ConfirmationGroupRowBuilder from "./run-history-page-group-row-builder";
import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
import ReplayRowBuilder from "./run-history-page-replay-row-builder";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

class NamedHistoryBuilder {
	public constructor(
		private readonly props: Immutable<Partial<RunHistoryResponseBody>> = {},
	) {}

	public build(): RunHistoryResponseBody {
		return {
			launches: [],
			rows: this.props.rows ?? [
				...NamedHistoryBuilder.pipelineRows(),
				...NamedHistoryBuilder.replayRows(),
				...NamedHistoryBuilder.groupRows(),
			],
			unreadable: [],
			...this.props,
		};
	}

	private static pipelineRows(): RunHistoryResponseBody["rows"] {
		return [
			new PipelineRunRowBuilder({
				checkpoints: [{ shortId: "audit-log/r7/s0", stage: "initial" }],
				progress: {
					ceilingUsd: undefined,
					elapsedMs: 9000,
					measuredAt: new Date().toISOString(),
					runSpentUsd: undefined,
					runTokens: undefined,
					spendScope: "this stage's session so far",
					spentUsd: 0.9,
					stage: "build",
					stageElapsedMs: undefined,
					stageState: "session running",
					state: "running",
				},
				run: "2026-09-07T00-00-00.000Z",
				shortId: "audit-log/r7",
				staleness: unversionedStaleness({ causes: [], stale: false }),
				status: "RUNNING",
			}).build(),
		];
	}

	private static replayRows(): RunHistoryResponseBody["rows"] {
		return [
			new ReplayRowBuilder({
				attempt: { count: 3, position: 2 },
				checkpointShortId: "audit-log/r2/s1",
				grade: "A",
				links: [
					{
						href: "/replays/60758c/2026-09-06T22-33-15.057Z",
						label: "context",
						state: "available",
					},
				],
				recordId: "attempt:stage:60758c/2026-09-06T22-33-15.057Z",
				shortId: "audit-log/r6",
				timestamp: "2026-09-06T22-33-15.057Z",
			}).build(),
		];
	}

	private static groupRows(): RunHistoryResponseBody["rows"] {
		return [
			new ConfirmationGroupRowBuilder({
				caseId: "brief-reply",
				groupId: "group-a",
				recordId: "group:group-a",
				shortId: "brief-reply/g4",
			}).build(),
		];
	}
}

export { NamedHistoryBuilder as default };

export type { RunHistoryResponse } from "./run-history-query";
