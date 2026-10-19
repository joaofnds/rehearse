import { describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { unversionedStaleness } from "#client/test-support/run-figures";

import RunHistoryPage from "./run-history-page";
import FinishedHistoryBuilder from "./run-history-page-finished-history-builder";
import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
import { cellOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";

async function testRendersARowForEveryRecordedRunStatusAndCorpusAsDesignSystemComponents(): Promise<void> {
	respondingWith({
		launches: [],
		rows: [
			new PipelineRunRowBuilder({
				corpusVersion: { digest: "a3a62f", kind: "version" },
				grade: "B",
				run: "2026-09-06T21-58-29.508Z",
				stage: "shape",
				staleness: unversionedStaleness({
					causes: ["CLAUDE.md changed"],
					stale: true,
				}),
				status: "STOPPED:build",
			}).build(),
		],
		unreadable: [],
	});

	renderPage();

	await waitFor(() => {
		expect(screen.getByText("2026-09-06T21-58-29.508Z")).toBeInTheDocument();
	});
	expect(screen.getByText("audit-log")).toBeInTheDocument();
	expect(
		cellOf({ column: "Outcome", run: "2026-09-06T21-58-29.508Z" }),
	).toHaveTextContent("stopped at build");
	expect(screen.getByText("corpus@a3a62f")).toBeInTheDocument();
	expect(screen.getByText("stale")).toBeInTheDocument();
}

async function testLinksAStoppedRunToTheStageItStoppedOnNotItsLastCheckpoint(): Promise<void> {
	respondingWith(new FinishedHistoryBuilder().build());

	const page = renderPage();

	expect(await page.findByRole("link", { name: /build/u })).toHaveAttribute(
		"href",
		"/runs/2026-09-06T21-58-29.508Z/stages/build",
	);
}

async function testLeavesAnOutcomeThatIsNotAStopAsTextLinkingNowhere(): Promise<void> {
	respondingWith(new FinishedHistoryBuilder().build());

	await renderPage().findByText("2026-09-03T00-00-00.000Z");

	const outcome = cellOf({
		column: "Outcome",
		run: "2026-09-03T00-00-00.000Z",
	});
	expect(outcome).toHaveTextContent("completed");
	expect(within(outcome).queryByRole("link")).not.toBeInTheDocument();
}

async function testLinksAPipelineRunSIdToItsRunDetail(): Promise<void> {
	respondingWith(new FinishedHistoryBuilder().build());

	const page = renderPage();

	expect(
		await page.findByRole("link", { name: "2026-09-06T21-58-29.508Z" }),
	).toHaveAttribute("href", "/runs/2026-09-06T21-58-29.508Z?view=results");
}

async function testNamesTheRecordsTableOnceSoTheCaptionIsNotDoubledByAHeading(): Promise<void> {
	const expectedMatchingElementsCount = 1;

	respondingWith({
		launches: [],
		rows: [
			new PipelineRunRowBuilder({
				corpusVersion: { digest: "a3a62f", kind: "version" },
				grade: "B",
				run: "2026-09-06T21-58-29.508Z",
				stage: "shape",
				staleness: unversionedStaleness({
					causes: ["CLAUDE.md changed"],
					stale: true,
				}),
				status: "STOPPED:build",
			}).build(),
		],
		unreadable: [],
	});

	renderPage();

	await waitFor(() => {
		expect(screen.getByRole("table")).toHaveAccessibleName("Run history");
	});
	expect(screen.getAllByText("Run history")).toHaveLength(
		expectedMatchingElementsCount,
	);
}

async function testRendersAFilterBarBuiltFromFilterPillAllPressedByDefault(): Promise<void> {
	respondingWith({ launches: [], rows: [], unreadable: [] });

	renderPage();

	await waitFor(() => {
		expect(
			screen.getByRole("button", { name: /^All(?: \d+)?$/u }),
		).toBeInTheDocument();
	});
	expect(
		screen.getByRole("button", { name: /^All(?: \d+)?$/u }),
	).toHaveAttribute("aria-pressed", "true");
}

async function testNamesTheReadableEntryTotalAndItsRecordAndLaunchCounts(): Promise<void> {
	respondingWith(new FinishedHistoryBuilder().build());

	renderPage();

	expect(
		await screen.findByText("2 readable entries · 2 records · 0 launches"),
	).toBeInTheDocument();
}

async function testKeepsCountingEveryRecordOnTheAllPillWhileStoppedNarrowsTheTable(): Promise<void> {
	respondingWith(new FinishedHistoryBuilder().build());
	renderPage();
	await screen.findByText("2026-09-03T00-00-00.000Z");

	fireEvent.click(screen.getByRole("button", { name: "Stopped" }));

	expect(screen.getByRole("button", { name: "All 2" })).toBeInTheDocument();
}

async function testNarrowsTheTableToStoppedRunsWhenTheStoppedFilterIsPressed(): Promise<void> {
	respondingWith(new FinishedHistoryBuilder().build());

	renderPage();

	await waitFor(() => {
		expect(screen.getByText("2026-09-06T21-58-29.508Z")).toBeInTheDocument();
	});
	expect(screen.getByText("2026-09-03T00-00-00.000Z")).toBeInTheDocument();

	fireEvent.click(screen.getByRole("button", { name: "Stopped" }));

	expect(screen.getByText("2026-09-06T21-58-29.508Z")).toBeInTheDocument();
	expect(
		screen.queryByText("2026-09-03T00-00-00.000Z"),
	).not.toBeInTheDocument();
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	it(
		"renders a row for every recorded run, status and corpus as design-system components",
		testRendersARowForEveryRecordedRunStatusAndCorpusAsDesignSystemComponents,
	);
	it(
		"links a stopped run to the stage it stopped on, not its last checkpoint",
		testLinksAStoppedRunToTheStageItStoppedOnNotItsLastCheckpoint,
	);
	it(
		"leaves an outcome that is not a stop as text, linking nowhere",
		testLeavesAnOutcomeThatIsNotAStopAsTextLinkingNowhere,
	);
	it(
		"links a pipeline run's id to its run detail",
		testLinksAPipelineRunSIdToItsRunDetail,
	);
	it(
		"names the records table once, so the caption is not doubled by a heading",
		testNamesTheRecordsTableOnceSoTheCaptionIsNotDoubledByAHeading,
	);
	it(
		"renders a filter bar built from FilterPill, all pressed by default",
		testRendersAFilterBarBuiltFromFilterPillAllPressedByDefault,
	);
	it(
		"names the readable entry total and its record and launch counts",
		testNamesTheReadableEntryTotalAndItsRecordAndLaunchCounts,
	);
	it(
		"keeps counting every record on the All pill while Stopped narrows the table",
		testKeepsCountingEveryRecordOnTheAllPillWhileStoppedNarrowsTheTable,
	);
	it(
		"narrows the table to stopped runs when the Stopped filter is pressed",
		testNarrowsTheTableToStoppedRunsWhenTheStoppedFilterIsPressed,
	);
});
