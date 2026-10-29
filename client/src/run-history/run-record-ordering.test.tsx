import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
	fireEvent,
	screen,
	waitFor,
	waitForElementToBeRemoved,
	within,
} from "@testing-library/react";

import { runHistoryReplies } from "#client/test-support/fetch-stub";
import { renderAppWithStub } from "#client/test-support/render-app";

import { recordIdentity, sortDiscoveredRows } from "./run-discovery";
import {
	MIXED_RECORD_ROWS,
	SORT_NEWER,
	SORT_OLDER,
	SORT_PARTIAL,
	TIMED_GROUP,
	TIMED_PIPELINE,
	TIMED_REPLAY,
	TIMED_SESSION,
	UNTIMED_SESSION,
	originalFetch,
	run,
	visibleRunIds,
} from "./run-discovery-test-fixtures";

let sortingRouter: ReturnType<typeof renderAppWithStub> | null = null;

const expectedRowCount = 2;

const launch = {
	attempts: 1,
	caseId: "audit",
	kind: "launch",
	launchedAt: "2026-10-10T12:00:00.000Z",
	run: undefined,
	stage: undefined,
	target: "case",
} as const;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function ordersMixedRecordKindsByTheInstantTheirRecordsActuallyName(): void {
	expect(
		sortDiscoveredRows(MIXED_RECORD_ROWS, "newest").map((row) =>
			recordIdentity(row),
		),
	).toEqual([
		TIMED_REPLAY.timestamp,
		TIMED_SESSION.uuid,
		TIMED_PIPELINE.run,
		TIMED_GROUP.groupId,
		UNTIMED_SESSION.uuid,
	]);
	expect(
		sortDiscoveredRows(MIXED_RECORD_ROWS, "oldest").map((row) =>
			recordIdentity(row),
		),
	).toEqual([
		TIMED_GROUP.groupId,
		TIMED_PIPELINE.run,
		TIMED_SESSION.uuid,
		TIMED_REPLAY.timestamp,
		UNTIMED_SESSION.uuid,
	]);
}

async function preparesSortableRecords(): Promise<void> {
	sortingRouter = renderAppWithStub(
		"/?status=failed&query=audit",
		runHistoryReplies({
			launches: [],
			rows: [
				{ ...run("legacy", "FAIL"), caseId: undefined },
				{
					...run(SORT_OLDER, "FAIL"),
					caseId: "alpha",
					cost: { missing: [], parts: [], state: "available", usd: 5.25 },
				},
				{
					...run(SORT_NEWER, "FAIL"),
					caseId: "zeta",
					cost: { missing: [], parts: [], state: "available", usd: 2.1 },
				},
				{
					...run(SORT_PARTIAL, "FAIL"),
					caseId: "gamma",
					cost: {
						missing: [{ part: "worker", reason: "metrics missing" }],
						parts: [],
						state: "available",
						usd: 100,
					},
				},
			],
			unreadable: [],
		}),
	);

	await screen.findByRole("table", { name: "Run history" });
}

async function sortsRecordsThroughTheURLWithMissingDatesAndIncompleteCostsLast(): Promise<void> {
	expect(visibleRunIds()).toEqual([
		SORT_NEWER,
		SORT_PARTIAL,
		SORT_OLDER,
		"legacy",
	]);
	fireEvent.change(screen.getByRole("combobox", { name: "Sort runs" }), {
		target: { value: "oldest" },
	});
	await waitFor(() => {
		expect(visibleRunIds()).toEqual([
			SORT_OLDER,
			SORT_PARTIAL,
			SORT_NEWER,
			"legacy",
		]);
	});
	expect(sortingRouter?.state.location.search).toMatchObject({
		query: "audit",
		sort: "oldest",
		status: "failed",
	});
}

async function sortsReportedCostAndCase(): Promise<void> {
	fireEvent.change(screen.getByRole("combobox", { name: "Sort runs" }), {
		target: { value: "oldest" },
	});
	await screen.findByRole("option", { name: "Oldest first", selected: true });
	fireEvent.change(screen.getByRole("combobox", { name: "Sort runs" }), {
		target: { value: "cost" },
	});
	await waitFor(() => {
		expect(visibleRunIds()).toEqual([
			SORT_OLDER,
			SORT_NEWER,
			SORT_PARTIAL,
			"legacy",
		]);
	});
	expect(
		screen.getByText(
			"Cost sorting uses complete reported amounts; partial and missing costs come last.",
		),
	).toBeInTheDocument();
	fireEvent.change(screen.getByRole("combobox", { name: "Sort runs" }), {
		target: { value: "case" },
	});
	await waitFor(() => {
		expect(visibleRunIds()).toEqual([
			SORT_OLDER,
			SORT_PARTIAL,
			SORT_NEWER,
			"legacy",
		]);
	});
}

async function opensSeparateLaunchHistory(): Promise<void> {
	renderAppWithStub(
		"/",
		runHistoryReplies({
			launches: [
				{ ...launch, id: "active-launch", status: "RUNNING" },
				{ ...launch, id: "ended-launch", status: "OPERATOR_STOPPED" },
			],
			rows: [run("saved", "PASS")],
			unreadable: [],
		}),
	);
	await screen.findByRole("table", { name: "Run history" });
}

function keepsActiveLaunchesSeparateAndEndedLaunchHistoryAccessibleWithConsistentCounts(): void {
	const records = screen.getByRole("table", { name: "Run history" });
	expect(within(records).getAllByRole("row")).toHaveLength(expectedRowCount);
	expect(within(records).queryByText(/launch /u)).not.toBeInTheDocument();
	expect(
		screen.getByRole("table", { name: "Active launch queue" }),
	).toHaveTextContent("launch active-l");
	expect(screen.getByRole("button", { name: "All 3" })).toBeInTheDocument();
	expect(
		screen.getByText(
			"3 of 3 readable entries match · 1 record · 1 active launch · 1 ended launch",
		),
	).toBeInTheDocument();
	expect(screen.queryByText("launch ended-la")).not.toBeInTheDocument();
}

async function filtersToEndedLaunches(): Promise<void> {
	fireEvent.click(
		screen.getByRole("button", { name: "Ended launch history (1)" }),
	);
	expect(
		screen.getByRole("table", { name: "Ended launches" }),
	).toHaveTextContent("launch ended-la");
	fireEvent.click(screen.getByRole("button", { name: "Ended" }));
	await waitForElementToBeRemoved(() =>
		screen.queryByRole("table", { name: "Active launch queue" }),
	);
	expect(
		screen.getByText(
			"2 of 3 readable entries match · 1 record · 0 active launches · 1 ended launch",
		),
	).toBeInTheDocument();
}

describe("discovering saved runs and attempts", () => {
	it(
		"orders mixed record kinds by the instant their records actually name",
		ordersMixedRecordKindsByTheInstantTheirRecordsActuallyName,
	);
	describe("with dated, legacy and partly costed records", () => {
		beforeEach(preparesSortableRecords);
		it(
			"orders complete costs before partial amounts and then sorts by case",
			sortsReportedCostAndCase,
		);
		it(
			"sorts records through the URL with missing dates and incomplete costs last",
			sortsRecordsThroughTheURLWithMissingDatesAndIncompleteCostsLast,
		);
	});
	describe("with active and ended launches beside saved records", () => {
		beforeEach(opensSeparateLaunchHistory);
		it(
			"keeps active launches separate and ended launch history accessible with consistent counts",
			keepsActiveLaunchesSeparateAndEndedLaunchHistoryAccessibleWithConsistentCounts,
		);
		it(
			"filters ended launch history with matching counts",
			filtersToEndedLaunches,
		);
	});
});
