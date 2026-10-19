import { unversionedStaleness } from "#client/test-support/run-figures";

import ConfirmationGroupRowBuilder from "./run-history-page-group-row-builder";
import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
import ReplayRowBuilder from "./run-history-page-replay-row-builder";
import SessionAttemptRowBuilder from "./run-history-page-session-row-builder";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

class RecordKindsHistoryBuilder {
	public constructor(
		private readonly props: Partial<RunHistoryResponseBody> = {},
	) {}

	public build(): RunHistoryResponseBody {
		return {
			launches: [],
			rows: [
				...RecordKindsHistoryBuilder.pipelineRows(),
				...RecordKindsHistoryBuilder.replayRows(),
				...RecordKindsHistoryBuilder.sessionRows(),
				...RecordKindsHistoryBuilder.groupRows(),
			],
			unreadable: [],
			...this.props,
		};
	}

	private static pipelineRows(): RunHistoryResponseBody["rows"] {
		return [
			new PipelineRunRowBuilder({
				corpusVersion: { digest: "a3a62f", kind: "version" },
				grade: "B",
				links: [
					{
						href: "/runs/2026-09-06T21-58-29.508Z/stages/shape",
						label: "shape",
						state: "available",
					},
				],
				run: "2026-09-06T21-58-29.508Z",
				stage: "shape",
				staleness: unversionedStaleness({ causes: [], stale: false }),
				status: "STOPPED:build",
			}).build(),
			new PipelineRunRowBuilder({
				caseId: undefined,
				links: [
					{
						label: "shape",
						reason: "failed before saving its context",
						state: "unavailable",
					},
				],
				run: "2026-09-17T12-50-49.127Z",
				staleness: unversionedStaleness({ causes: [], stale: false }),
				status: "FAILED",
			}).build(),
		];
	}

	private static replayRows(): RunHistoryResponseBody["rows"] {
		return [
			new ReplayRowBuilder({
				grade: "F",
				links: [
					{
						href: "/replays/60758c/2026-09-06T22-33-15.057Z",
						label: "context",
						state: "available",
					},
				],
				recordId: "attempt:stage:60758c/2026-09-06T22-33-15.057Z",
				stage: "shape",
				status: "STOP",
				timestamp: "2026-09-06T22-33-15.057Z",
			}).build(),
		];
	}

	private static sessionRows(): RunHistoryResponseBody["rows"] {
		return [
			new SessionAttemptRowBuilder({
				links: [
					{
						href: "/attempts/session/brief-reply/0f6b6f2a-0000-4000-8000-000000000001",
						label: "context",
						state: "available",
					},
				],
				recordId:
					"attempt:session:brief-reply/0f6b6f2a-0000-4000-8000-000000000001",
				status: "UNSUCCESSFUL",
				uuid: "0f6b6f2a-0000-4000-8000-000000000001",
			}).build(),
		];
	}

	private static groupRows(): RunHistoryResponseBody["rows"] {
		return [
			new ConfirmationGroupRowBuilder({
				caseId: "brief-reply",
				groupId: "group-a",
				links: [
					{
						href: "/groups/group-a/reps/group-a-rep-1/attempt",
						label: "rep 1",
						state: "available",
					},
					{
						label: "rep 2",
						reason: "no attempt recorded for group-a-rep-2",
						state: "unavailable",
					},
				],
				recordId: "group:group-a",
			}).build(),
		];
	}
}

export { RecordKindsHistoryBuilder as default };
