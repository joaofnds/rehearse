import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	setSystemTime,
} from "bun:test";

import { screen, waitFor } from "@testing-library/react";

import { unversionedStaleness } from "#client/test-support/run-figures";
import type { PipelineRunRow } from "#server/run-history";

import RunHistoryPage from "./run-history-page";
import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
import { cellOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
	serveHistorySequence,
	serveRunHistory,
} from "./run-history-page-test-harness";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const RUNNING_RUN = "2026-09-07T00-00-00.000Z";

const FUTURE_EVENT_OFFSET_MS = 1000;

const STOPPED_EVENT_AGE_MS = 52_000;

const HISTORY_REFETCH_WAIT_MS = 2500;

const NOW = new Date("2026-09-07T00:10:00.000Z");

function runningRow(): Extract<
	RunHistoryResponseBody["rows"][number],
	{ readonly kind: "run" }
> {
	return new PipelineRunRowBuilder({
		progress: liveProgress(),
		recordId: "run:2026-09-07T00-00-00.000Z",
		run: RUNNING_RUN,
		stageGrades: {
			grades: ["shape", "build", "review"].map((stage) => ({
				grade: { reasons: ["not graded yet"], state: "unavailable" },
				stage,
				status: "no-record",
			})),
			state: "available",
		},
		staleness: unversionedStaleness({ causes: [], stale: false }),
		status: "RUNNING",
	}).build();
}

function liveProgress(): Extract<
	PipelineRunRow["progress"],
	{ readonly state: "running" }
> {
	return {
		ceilingUsd: undefined,
		elapsedMs: 9000,
		measuredAt: NOW.toISOString(),
		runSpentUsd: 1.2,
		runTokens: undefined,
		spendScope: "this stage's session so far",
		spentUsd: 0.9,
		stage: "build",
		stageElapsedMs: undefined,
		stageState: "session running",
		state: "running",
	};
}

async function testMovesTheStepWallTimeAndCostWithNoPageReload(): Promise<void> {
	const bodies: RunHistoryResponseBody[] = [
		{ launches: [], rows: [runningRow()], unreadable: [] },
		{
			launches: [],
			rows: [
				{
					...runningRow(),
					progress: {
						...liveProgress(),
						elapsedMs: 74_000,
						runSpentUsd: 2.5,
						stage: "review",
					},
				},
			],
			unreadable: [],
		},
	];
	serveHistorySequence(bodies);

	await renderPage().findByText(RUNNING_RUN);

	await waitFor(
		() => {
			expect(cellOf({ column: "Outcome", run: RUNNING_RUN })).toHaveTextContent(
				"running · step 3 of 3review · session running",
			);
		},
		{ timeout: 5000 },
	);
	expect(cellOf({ column: "Wall", run: RUNNING_RUN }).textContent).toBe(
		"01:14",
	);
	expect(cellOf({ column: "Cost", run: RUNNING_RUN }).textContent).toBe(
		"$2.50so far",
	);
}

async function testAdvancesTheWallTimeEverySecond(): Promise<void> {
	respondingWith({ launches: [], rows: [runningRow()], unreadable: [] });

	await renderPage().findByText(RUNNING_RUN);
	setSystemTime(new Date(NOW.getTime() + FUTURE_EVENT_OFFSET_MS));

	await waitFor(
		() => {
			expect(cellOf({ column: "Wall", run: RUNNING_RUN }).textContent).toBe(
				"00:10",
			);
		},
		{ timeout: 2500 },
	);
}

async function testCarriesTheWallTimeForwardFromTheRunSLastMeasurement(): Promise<void> {
	respondingWith({
		launches: [],
		rows: [
			{
				...runningRow(),
				progress: {
					...liveProgress(),
					measuredAt: new Date(
						NOW.getTime() - STOPPED_EVENT_AGE_MS,
					).toISOString(),
				},
			},
		],
		unreadable: [],
	});

	await renderPage().findByText(RUNNING_RUN);

	expect(cellOf({ column: "Wall", run: RUNNING_RUN }).textContent).toBe(
		"01:01",
	);
}

async function testReReadsTheListNoFasterThanTheIdlePace(): Promise<void> {
	const server = serveRunHistory(
		{
			launches: [],
			rows: [{ ...runningRow(), progress: { state: "recorded" } }],
			unreadable: [],
		},
		new Map([
			["GET /api/run-staleness", { body: { records: {} }, status: 200 }],
			[
				"GET /api/confirmation-archives",
				{ body: { archived: [], unreadable: [] }, status: 200 },
			],
		]),
	);
	const listReads = (): number =>
		server.sent.filter(({ pathname }) => pathname === "/api/run-listing")
			.length;

	renderPage();

	await waitFor(() => {
		expect(screen.getByText("2026-09-07T00-00-00.000Z")).toBeInTheDocument();
	});
	const afterFirstRender = listReads();
	await Bun.sleep(HISTORY_REFETCH_WAIT_MS);

	expect(listReads()).toBe(afterFirstRender);
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("when a run is in flight", () => {
		beforeEach(() => {
			setSystemTime(NOW);
		});
		afterEach(() => {
			setSystemTime();
		});
		it(
			"moves the step, wall time and cost with no page reload",
			testMovesTheStepWallTimeAndCostWithNoPageReload,
		);
		it(
			"advances the wall time every second",
			testAdvancesTheWallTimeEverySecond,
		);
		it(
			"carries the wall time forward from the run's last measurement",
			testCarriesTheWallTimeForwardFromTheRunSLastMeasurement,
		);
	});
	describe("when no run is in flight", () => {
		beforeEach(() => {
			setSystemTime(NOW);
		});
		afterEach(() => {
			setSystemTime();
		});
		it(
			"re-reads the list no faster than the idle pace",
			testReReadsTheListNoFasterThanTheIdlePace,
		);
	});
});
