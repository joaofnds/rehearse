import type { RowStaleness } from "#server/run-history";

import ReplayRowBuilder from "./run-history-page-replay-row-builder";
import type { RunHistoryResponse } from "./run-history-query";

interface StaleHistoryRow {
	readonly name: string;
	readonly staleness: RowStaleness;
}

interface StalenessHistoryFixture {
	readonly rows: readonly StaleHistoryRow[];
}

class StalenessHistoryBuilder {
	public constructor(
		private readonly props: Partial<StalenessHistoryFixture> = {},
	) {}

	public build(): RunHistoryResponse {
		return {
			launches: [],
			rows: (this.props.rows ?? []).map(({ name, staleness }) =>
				new ReplayRowBuilder({
					grade: "B",
					recordId: `attempt:stage:60758c/${name}`,
					staleness,
					timestamp: name,
				}).build(),
			),
			unreadable: [],
		};
	}
}

export { StalenessHistoryBuilder as default };
