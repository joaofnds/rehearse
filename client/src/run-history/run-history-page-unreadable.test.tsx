import { describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { unversionedStaleness } from "#client/test-support/run-figures";

import RunHistoryPage from "./run-history-page";
import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const unreadableReport: RunHistoryResponseBody = {
	launches: [],
	rows: [
		new PipelineRunRowBuilder({
			corpusVersion: { digest: "a3a62f", kind: "version" },
			grade: "B",
			run: "2026-09-06T21-58-29.508Z",
			stage: "build",
			staleness: unversionedStaleness({ causes: [], stale: false }),
		}).build(),
	],
	unreadable: [
		{
			id: "run:2026-09-01T00-00-00.000Z",
			kind: "run",
			reason: "manifest.json is empty",
		},
		{
			id: "run:2026-09-02T00-00-00.000Z",
			kind: "run",
			reason: "artifact.json is empty",
		},
	],
};

const UNREADABLE_RECORD_KINDS = [
	{ expected: "2 runs", kind: "run" },
	{ expected: "2 session attempts", kind: "session-attempt" },
	{ expected: "2 replays", kind: "replay" },
	{ expected: "2 confirmation runs", kind: "group" },
	{ expected: "2 launches", kind: "launch" },
	{ expected: "2 short id registries", kind: "short-ids" },
] as const;

async function testNamesThemAsRecordsCountedByKindWhateverKindsTheyAre(): Promise<void> {
	respondingWith({
		...unreadableReport,
		launches: [],
		unreadable: [
			...unreadableReport.unreadable,
			{
				id: "group:g-1",
				kind: "group",
				reason: "incomplete: no group.json recorded",
			},
			{
				id: "group:g-2",
				kind: "group",
				reason: "incomplete: no group.json recorded",
			},
			{
				id: "attempt:stage:lineage-build/2026-09-03T01-00-00.000Z",
				kind: "replay",
				reason: "replay record is empty",
			},
			{
				id: "attempt:session:smoke/0f6b",
				kind: "session-attempt",
				reason: "incomplete: no attempt.json recorded",
			},
		],
	});

	renderPage();

	const alert = await screen.findByRole("alert");

	expect(alert).toHaveTextContent("could not be read");
	expect(alert).not.toHaveTextContent("These runs");
	expect(alert).toHaveTextContent("2 runs");
	expect(alert).toHaveTextContent("2 confirmation runs");
	expect(alert).toHaveTextContent("1 session attempt");
	expect(alert).toHaveTextContent("1 replay");
	expect(alert).not.toHaveTextContent("group:g-1");
}

async function testNamesAnUnreadableShortIdRegistryAmongThem(): Promise<void> {
	respondingWith({
		...unreadableReport,
		launches: [],
		unreadable: [
			...unreadableReport.unreadable,
			{
				id: "short-ids",
				kind: "short-ids",
				reason: "Directories cannot be read like files",
			},
		],
	});

	renderPage();

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"1 short id registry",
	);
}

async function testNamesEveryUnreadableRecordByIdAndReasonOnceTheListIsOpened(): Promise<void> {
	respondingWith(unreadableReport);

	renderPage();

	const alert = await screen.findByRole("alert");
	fireEvent.click(
		within(alert).getByRole("button", { name: "Show details (2)" }),
	);

	expect(alert).toHaveTextContent("run:2026-09-01T00-00-00.000Z");
	expect(alert).toHaveTextContent("manifest.json is empty");
	expect(alert).toHaveTextContent("run:2026-09-02T00-00-00.000Z");
	expect(alert).toHaveTextContent("artifact.json is empty");
}

async function testKeepsTheAlertWhenTheStatusFilterHidesEveryRow(): Promise<void> {
	respondingWith(unreadableReport);

	renderPage();

	await screen.findByRole("alert");
	fireEvent.click(screen.getByRole("button", { name: "Stopped" }));

	expect(screen.getByRole("alert")).toHaveTextContent("2 runs");
}

async function testShowsTheUnreadableRunsRatherThanTheEmptyStateWhenTheReportHasNoRowsAtAll(): Promise<void> {
	respondingWith({
		launches: [],
		rows: [],
		unreadable: unreadableReport.unreadable,
	});

	renderPage();

	await screen.findByRole("alert");

	expect(screen.queryByText("No runs recorded")).not.toBeInTheDocument();
}

async function testSaysNoRecordMatchesWhenRowsExistTheFilterHidesThemAndNothingWasUnreadable(): Promise<void> {
	respondingWith({ ...unreadableReport, launches: [], unreadable: [] });

	renderPage();

	await waitFor(() => {
		expect(screen.getByText("audit-log")).toBeInTheDocument();
	});
	fireEvent.click(screen.getByRole("button", { name: "Stopped" }));

	expect(
		screen.getByText("No record matches this filter and search."),
	).toBeInTheDocument();
	expect(screen.queryByText("No runs recorded")).not.toBeInTheDocument();
}

async function testSaysNoRecordMatchesWhenTheFilterHidesEveryRowAndUnreadableRunsAreAlsoPresent(): Promise<void> {
	respondingWith(unreadableReport);

	renderPage();

	await waitFor(() => {
		expect(screen.getByText("audit-log")).toBeInTheDocument();
	});
	fireEvent.click(screen.getByRole("button", { name: "Stopped" }));

	expect(
		screen.getByText("No record matches this filter and search."),
	).toBeInTheDocument();
	expect(screen.queryByText("No runs recorded")).not.toBeInTheDocument();
}

async function testCountsUnreadableRecordKind({
	kind,
	expected,
}: UnreadableKindReading): Promise<void> {
	respondingWith({
		...unreadableReport,
		launches: [],
		unreadable: [
			{ id: `${kind}-first`, kind, reason: "unreadable" },
			{ id: `${kind}-second`, kind, reason: "unreadable" },
		],
	});

	renderPage();

	expect(await screen.findByRole("alert")).toHaveTextContent(expected);
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("when the report can carry unreadable runs", () => {
		it(
			"names them as records, counted by kind, whatever kinds they are",
			testNamesThemAsRecordsCountedByKindWhateverKindsTheyAre,
		);

		it(
			"names an unreadable short id registry among them",
			testNamesAnUnreadableShortIdRegistryAmongThem,
		);

		it.each([...UNREADABLE_RECORD_KINDS])(
			"counts two unreadable records of kind $kind as $expected",
			testCountsUnreadableRecordKind,
		);

		it(
			"names every unreadable record by id and reason once the list is opened",
			testNamesEveryUnreadableRecordByIdAndReasonOnceTheListIsOpened,
		);

		it(
			"keeps the alert when the status filter hides every row",
			testKeepsTheAlertWhenTheStatusFilterHidesEveryRow,
		);

		it(
			"shows the unreadable runs rather than the empty state when the report has no rows at all",
			testShowsTheUnreadableRunsRatherThanTheEmptyStateWhenTheReportHasNoRowsAtAll,
		);

		it(
			"says no record matches when rows exist, the filter hides them, and nothing was unreadable",
			testSaysNoRecordMatchesWhenRowsExistTheFilterHidesThemAndNothingWasUnreadable,
		);

		it(
			"says no record matches when the filter hides every row and unreadable runs are also present",
			testSaysNoRecordMatchesWhenTheFilterHidesEveryRowAndUnreadableRunsAreAlsoPresent,
		);
	});
});

interface UnreadableKindReading {
	readonly kind: RunHistoryResponseBody["unreadable"][number]["kind"];
	readonly expected: string;
}
