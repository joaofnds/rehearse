import { describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor } from "@testing-library/react";

import RunHistoryPage from "./run-history-page";
import FinishedHistoryBuilder from "./run-history-page-finished-history-builder";
import LaunchRowBuilder from "./run-history-page-launch-row-builder";
import { cellOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";

const launchedAt = "2026-09-29T10:00:00.000Z";

const UNRECORDED_LAUNCH_COLUMNS = [
	"Step grades",
	"Final outcome",
	"Cost",
	"Wall",
] as const;

async function testCountsTheLaunchOnTheAllPillBesideTheRecordsItLists(): Promise<void> {
	respondingWith({
		...new FinishedHistoryBuilder().build(),
		launches: [new LaunchRowBuilder({ launchedAt }).build()],
	});

	renderPage();

	expect(
		await screen.findByRole("button", { name: "All 3" }),
	).toBeInTheDocument();
}

async function testCountsLaunchesSeparatelyWithinTheReadableEntryTotal(): Promise<void> {
	respondingWith({
		...new FinishedHistoryBuilder().build(),
		launches: [new LaunchRowBuilder({ launchedAt }).build()],
	});

	renderPage();

	expect(
		await screen.findByText("3 readable entries · 2 records · 1 launch"),
	).toBeInTheDocument();
}

async function testListsAStartedCaseAsRunningAboveTheRecords(): Promise<void> {
	respondingWith({
		launches: [new LaunchRowBuilder({ attempts: 3, launchedAt }).build()],
		rows: [],
		unreadable: [],
	});

	renderPage();

	await waitFor(() => {
		expect(screen.getByText("launch 7b0c2d4e")).toBeInTheDocument();
	});
	expect(
		cellOf({ column: "Target", run: "launch 7b0c2d4e" }),
	).toHaveTextContent("audit-log");
	expect(
		cellOf({ column: "Target", run: "launch 7b0c2d4e" }),
	).toHaveTextContent("group · 3 attempts");
	expect(
		cellOf({ column: "Execution", run: "launch 7b0c2d4e" }),
	).toHaveTextContent("running");
	expect(screen.queryByText("No runs recorded")).not.toBeInTheDocument();
}

async function testNamesTheStageAndRunAStartedReplayReplays(): Promise<void> {
	respondingWith({
		launches: [
			new LaunchRowBuilder({
				caseId: undefined,
				id: "9c1d3e5f-0000-4000-8000-000000000000",
				launchedAt,
				run: "2026-09-06T21-58-29.508Z",
				stage: "build",
				target: "replay",
			}).build(),
		],
		rows: [],
		unreadable: [],
	});

	renderPage();

	await waitFor(() => {
		expect(screen.getByText("launch 9c1d3e5f")).toBeInTheDocument();
	});
	expect(
		cellOf({ column: "Target", run: "launch 9c1d3e5f" }),
	).toHaveTextContent("replay build · 2026-09-06T21-58-29.508Z");
}

async function testNamesTheCheckpointAStartedComparisonReplaysItsBaselineAt(): Promise<void> {
	respondingWith({
		launches: [
			new LaunchRowBuilder({
				attempts: 2,
				caseId: undefined,
				id: "4a2b6c8d-0000-4000-8000-000000000000",
				launchedAt,
				run: "2026-09-06T21-58-29.508Z",
				stage: "build",
				target: "comparison",
			}).build(),
		],
		rows: [],
		unreadable: [],
	});

	renderPage();

	await waitFor(() => {
		expect(screen.getByText("launch 4a2b6c8d")).toBeInTheDocument();
	});
	expect(
		cellOf({ column: "Target", run: "launch 4a2b6c8d" }),
	).toHaveTextContent("compare attempts at build · 2026-09-06T21-58-29.508Z");
}

async function testNamesTheCheckpointAStartedExtensionAddsAttemptsAt(): Promise<void> {
	respondingWith({
		launches: [
			new LaunchRowBuilder({
				attempts: 2,
				caseId: undefined,
				id: "5e3f7a9b-0000-4000-8000-000000000000",
				launchedAt,
				run: "2026-09-06T21-58-29.508Z",
				stage: "build",
				target: "extension",
			}).build(),
		],
		rows: [],
		unreadable: [],
	});

	renderPage();

	await waitFor(() => {
		expect(screen.getByText("launch 5e3f7a9b")).toBeInTheDocument();
	});
	expect(
		cellOf({ column: "Target", run: "launch 5e3f7a9b" }),
	).toHaveTextContent(
		"add attempts to a comparison at build · 2026-09-06T21-58-29.508Z",
	);
}

async function testNamesTheRunAStartedRootCauseAnalysisReadsAsOneCallItCannotStop(): Promise<void> {
	respondingWith({
		launches: [
			new LaunchRowBuilder({
				caseId: undefined,
				id: "6c4d8e0f-0000-4000-8000-000000000000",
				launchedAt,
				run: "2026-09-06T21-58-29.508Z",
				target: "analysis",
			}).build(),
		],
		rows: [],
		unreadable: [],
	});

	const { queryByRole } = renderPage();

	await waitFor(() => {
		expect(screen.getByText("launch 6c4d8e0f")).toBeInTheDocument();
	});
	const target = cellOf({ column: "Target", run: "launch 6c4d8e0f" });
	expect(target).toHaveTextContent(
		"root-cause analysis of 2026-09-06T21-58-29.508Z",
	);
	expect(target).toHaveTextContent("one call");
	expect(target).not.toHaveTextContent("one run");
	expect(
		queryByRole("button", { name: "Stop & restore repo" }),
	).not.toBeInTheDocument();
}

async function testListsALaunchTheOperatorStoppedAsStoppedWithNoControls(): Promise<void> {
	respondingWith({
		launches: [
			new LaunchRowBuilder({
				attempts: 3,
				launchedAt,
				status: "OPERATOR_STOPPED",
			}).build(),
		],
		rows: [],
		unreadable: [],
	});

	const { queryByRole } = renderPage();
	fireEvent.click(
		await screen.findByRole("button", { name: "Ended launch history (1)" }),
	);

	await waitFor(() => {
		expect(screen.getByText("launch 7b0c2d4e")).toBeInTheDocument();
	});
	const outcome = cellOf({ column: "Execution", run: "launch 7b0c2d4e" });
	expect(outcome).toHaveTextContent("stopped by the operator");
	expect(outcome).not.toHaveTextContent("running");
	expect(
		queryByRole("button", { name: "Stop & restore repo" }),
	).not.toBeInTheDocument();
}

async function testHidesUnrecordedLaunchColumn(column: string): Promise<void> {
	respondingWith({
		launches: [new LaunchRowBuilder({ launchedAt }).build()],
		rows: [],
		unreadable: [],
	});

	await renderPage().findByText("launch 7b0c2d4e");

	expect(
		screen.queryByRole("columnheader", { name: column }),
	).not.toBeInTheDocument();
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("when a launch from the browser has not recorded anything yet", () => {
		it(
			"counts the launch on the All pill beside the records it lists",
			testCountsTheLaunchOnTheAllPillBesideTheRecordsItLists,
		);

		it(
			"counts launches separately within the readable entry total",
			testCountsLaunchesSeparatelyWithinTheReadableEntryTotal,
		);

		it(
			"lists a started case as running, above the records",
			testListsAStartedCaseAsRunningAboveTheRecords,
		);

		it.each([...UNRECORDED_LAUNCH_COLUMNS])(
			"keeps %s out of a launch queue that has no record to read",
			testHidesUnrecordedLaunchColumn,
		);

		it(
			"names the stage and run a started replay replays",
			testNamesTheStageAndRunAStartedReplayReplays,
		);

		it(
			"names the checkpoint a started comparison replays its baseline at",
			testNamesTheCheckpointAStartedComparisonReplaysItsBaselineAt,
		);

		it(
			"names the checkpoint a started extension adds attempts at",
			testNamesTheCheckpointAStartedExtensionAddsAttemptsAt,
		);

		it(
			"names the run a started root-cause analysis reads, as one call it cannot stop",
			testNamesTheRunAStartedRootCauseAnalysisReadsAsOneCallItCannotStop,
		);

		it(
			"lists a launch the operator stopped as stopped, with no controls",
			testListsALaunchTheOperatorStoppedAsStoppedWithNoControls,
		);
	});
});
