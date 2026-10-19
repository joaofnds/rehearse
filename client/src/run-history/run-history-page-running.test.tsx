import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	setSystemTime,
} from "bun:test";

import { screen, waitFor, within } from "@testing-library/react";

import { unversionedStaleness } from "#client/test-support/run-figures";
import type { PipelineRunRow } from "#server/run-history";

import RunHistoryPage from "./run-history-page";
import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
import { cellOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const RUNNING_RUN = "2026-09-07T00-00-00.000Z";

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

async function testListsTheRunningRunBesideTheFinishedOnesMarkedRunning(): Promise<void> {
	respondingWith({ launches: [], rows: [runningRow()], unreadable: [] });

	renderPage();

	await waitFor(() => {
		expect(screen.getByText("2026-09-07T00-00-00.000Z")).toBeInTheDocument();
	});
	expect(cellOf({ column: "Outcome", run: RUNNING_RUN })).toHaveTextContent(
		"running",
	);
}

async function testNamesTheStepItIsInItsPlaceInThePipelineAndThatStepSStateAsItsOutcome(): Promise<void> {
	respondingWith({ launches: [], rows: [runningRow()], unreadable: [] });

	await renderPage().findByText(RUNNING_RUN);

	expect(cellOf({ column: "Outcome", run: RUNNING_RUN })).toHaveTextContent(
		"running · step 2 of 3build · session running",
	);
}

async function testReadsWhatTheRunHasSpentSoFarAsItsCost(): Promise<void> {
	respondingWith({ launches: [], rows: [runningRow()], unreadable: [] });

	await renderPage().findByText(RUNNING_RUN);

	expect(cellOf({ column: "Cost", run: RUNNING_RUN }).textContent).toBe(
		"$1.20so far",
	);
}

async function testReadsHowLongTheRunHasGoneAsItsWallTime(): Promise<void> {
	respondingWith({ launches: [], rows: [runningRow()], unreadable: [] });

	await renderPage().findByText(RUNNING_RUN);

	expect(cellOf({ column: "Wall", run: RUNNING_RUN }).textContent).toBe(
		"00:09",
	);
}

async function testHasNoProgressColumnSinceTheOutcomeCostAndWallCellsCarryIt(): Promise<void> {
	respondingWith({ launches: [], rows: [runningRow()], unreadable: [] });

	await renderPage().findByText(RUNNING_RUN);

	expect(
		screen.getAllByRole("columnheader").map((header) => header.textContent),
	).not.toContain("Progress");
}

async function testSaysWhatTheSpendFigureCoversWhereTheRunSOwnSpendIsNotRecorded(): Promise<void> {
	respondingWith({
		launches: [],
		rows: [
			{
				...runningRow(),
				progress: { ...liveProgress(), runSpentUsd: undefined },
			},
		],
		unreadable: [],
	});

	await renderPage().findByText(RUNNING_RUN);

	expect(cellOf({ column: "Cost", run: RUNNING_RUN }).textContent).toBe(
		"$0.90this stage's session so far",
	);
}

async function testShowsNoSpendCeilingOrLimitBesideTheFigure(): Promise<void> {
	respondingWith({ launches: [], rows: [runningRow()], unreadable: [] });

	await renderPage().findByText(RUNNING_RUN);

	const cost = within(cellOf({ column: "Cost", run: RUNNING_RUN }));
	expect(cost.queryByText(/\/\s*\$/u)).not.toBeInTheDocument();
	expect(cost.queryByText(/limit|ceiling|budget/iu)).not.toBeInTheDocument();
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
			"lists the running run beside the finished ones, marked running",
			testListsTheRunningRunBesideTheFinishedOnesMarkedRunning,
		);
		it(
			"names the step it is in, its place in the pipeline and that step's state as its outcome",
			testNamesTheStepItIsInItsPlaceInThePipelineAndThatStepSStateAsItsOutcome,
		);
		it(
			"reads what the run has spent so far as its cost",
			testReadsWhatTheRunHasSpentSoFarAsItsCost,
		);
		it(
			"reads how long the run has gone as its wall time",
			testReadsHowLongTheRunHasGoneAsItsWallTime,
		);
		it(
			"has no Progress column, since the outcome, cost and wall cells carry it",
			testHasNoProgressColumnSinceTheOutcomeCostAndWallCellsCarryIt,
		);
		it(
			"says what the spend figure covers where the run's own spend is not recorded",
			testSaysWhatTheSpendFigureCoversWhereTheRunSOwnSpendIsNotRecorded,
		);
		it(
			"shows no spend ceiling or limit beside the figure",
			testShowsNoSpendCeilingOrLimitBesideTheFigure,
		);
	});
});
