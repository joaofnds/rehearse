import { describe, expect, it } from "bun:test";
import type { RunHistoryResponse } from "./run-history-query";
import {
	polledRunHistoryQuery,
	polledRunListingQuery,
	somethingRuns,
} from "./run-history-polling";

type LaunchRow = RunHistoryResponse["launches"][number];

function launch(status: LaunchRow["status"]): LaunchRow {
	return {
		kind: "launch",
		id: `launch-${status}`,
		target: "case",
		caseId: "audit-log",
		run: undefined,
		stage: undefined,
		attempts: 1,
		launchedAt: "2026-09-29T00:00:00.000Z",
		status,
	};
}

function response(launches: readonly LaunchRow[]): RunHistoryResponse {
	return { rows: [], launches: [...launches], unreadable: [] };
}

describe(somethingRuns.name, () => {
	it("counts a launch whose process is still running", () => {
		expect(somethingRuns(response([launch("RUNNING")]))).toBe(true);
	});

	it("does not count a launch the operator stopped", () => {
		expect(somethingRuns(response([launch("OPERATOR_STOPPED")]))).toBe(false);
	});

	it("counts nothing before the first response", () => {
		expect(somethingRuns(undefined)).toBe(false);
	});
});

for (const [name, query] of [
	["polledRunHistoryQuery", polledRunHistoryQuery],
	["polledRunListingQuery", polledRunListingQuery],
] as const) {
	describe(name, () => {
		function intervalFor(data: RunHistoryResponse): number | false {
			return query.refetchInterval({ state: { data } });
		}

		it("re-reads the list more often while something runs than while nothing does", () => {
			const running = intervalFor(response([launch("RUNNING")]));
			const idle = intervalFor(response([]));

			expect(Number(running)).toBeLessThan(Number(idle));
		});

		it("keeps re-reading the list while nothing runs, so a run started elsewhere reaches every screen", () => {
			expect(intervalFor(response([]))).toBeNumber();
		});
	});
}
