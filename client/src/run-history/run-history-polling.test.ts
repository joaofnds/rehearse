import { describe, expect, it } from "bun:test";

import LaunchRowBuilder from "./run-history-page-launch-row-builder";
import {
	polledRunHistoryQuery,
	polledRunListingQuery,
	somethingRuns,
} from "./run-history-polling";
import type { RunHistoryResponse } from "./run-history-query";

type LaunchRow = RunHistoryResponse["launches"][number];

type ProcessLaunchRow = Exclude<LaunchRow, { status: "ENDED" }>;

function launch(status: ProcessLaunchRow["status"]): LaunchRow {
	return {
		attempts: 1,
		caseId: "audit-log",
		id: `launch-${status}`,
		kind: "launch",
		launchedAt: "2026-09-29T00:00:00.000Z",
		run: undefined,
		stage: undefined,
		status,
		target: "case",
	};
}

function response(launches: readonly LaunchRow[]): RunHistoryResponse {
	return { launches: [...launches], rows: [], unreadable: [] };
}

describe(somethingRuns.name, () => {
	it("counts a launch whose process is still running", () => {
		const listing = response([launch("RUNNING")]);
		expect(somethingRuns(listing)).toBe(true);
	});

	it("does not count a launch that ended by an error", () => {
		const listing = response([new LaunchRowBuilder().buildEnded("refused")]);
		expect(somethingRuns(listing)).toBe(false);
	});

	it("does not count a launch the operator stopped", () => {
		const listing = response([launch("OPERATOR_STOPPED")]);
		expect(somethingRuns(listing)).toBe(false);
	});

	it("counts nothing before the first response", () => {
		expect(somethingRuns()).toBe(false);
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
