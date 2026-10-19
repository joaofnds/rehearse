import ReplayableRowBuilder from "./run-history-page-replayable-row-builder";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const STOPPED = "2026-09-20T10-00-00.000Z";

const FINISHED = "2026-09-21T10-00-00.000Z";

class ReplayHistoryBuilder {
	public constructor(
		private readonly props: Partial<RunHistoryResponseBody> = {},
	) {}

	public build(): RunHistoryResponseBody {
		return {
			launches: [],
			rows: [
				new ReplayableRowBuilder({
					replayableStages: ["plan", "build", "review"],
					run: FINISHED,
					status: "COMPLETE",
				}).build(),
				new ReplayableRowBuilder({
					replayableStages: ["plan", "build"],
					run: STOPPED,
					status: "STOPPED:build",
				}).build(),
			],
			unreadable: [],
			...this.props,
		};
	}
}

export { FINISHED, STOPPED, ReplayHistoryBuilder };
