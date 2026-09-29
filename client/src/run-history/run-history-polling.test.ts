import { describe, expect, it } from "bun:test";
import type { RunHistoryResponse } from "./run-history-query";
import { somethingRuns } from "./run-history-polling";

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
