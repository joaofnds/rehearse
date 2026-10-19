import { describe, expect, it } from "bun:test";

import type { RenderResult } from "@testing-library/react";
import { fireEvent, waitFor, within } from "@testing-library/react";

import RunHistoryPage from "./run-history-page";
import {
	ATTEMPT,
	FINISHED,
	FilteredHistoryBuilder,
	GROUP,
	IN_FLIGHT,
	REPLAY,
	RUNNING_LAUNCH,
	STOPPED,
	STOPPED_LAUNCH,
} from "./run-history-page-filtered-history-builder";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const LAUNCH_ID_PREVIEW_CHARACTERS = 8;

const PREFIX_START_INDEX = 0;

const EVERY_RECORD = [
	FINISHED,
	IN_FLIGHT,
	STOPPED,
	REPLAY,
	GROUP,
	ATTEMPT,
	`launch ${RUNNING_LAUNCH.slice(PREFIX_START_INDEX, LAUNCH_ID_PREVIEW_CHARACTERS)}`,
	`launch ${STOPPED_LAUNCH.slice(PREFIX_START_INDEX, LAUNCH_ID_PREVIEW_CHARACTERS)}`,
] as const;

const COMPOSABLE_FILTERS = [
	["Running", ["Running", "All kinds", "All corpora"]],
	["Stopped", ["Stopped", "All kinds", "All corpora"]],
	["Replays", ["All 8", "Replays", "All corpora"]],
	["Groups", ["All 8", "Groups", "All corpora"]],
	["Current corpus", ["All 8", "All kinds", "Current corpus"]],
] as const;

const FILTER_RESULTS = [
	[
		"Running",
		[
			IN_FLIGHT,
			`launch ${RUNNING_LAUNCH.slice(PREFIX_START_INDEX, LAUNCH_ID_PREVIEW_CHARACTERS)}`,
		],
	],
	["Stopped", [STOPPED]],
	["Replays", [REPLAY]],
	["Groups", [GROUP]],
	["Current corpus", [FINISHED]],
] as const;

const SEARCH_RESULTS = [
	["a case id", "payments", [IN_FLIGHT]],
	["part of a case id typed in capitals", "AUDIT", [FINISHED, STOPPED, REPLAY]],
	["a corpus digest", "b2c0ff", [IN_FLIGHT]],
	["a corpus digest with its label", "corpus@C3C0", [STOPPED]],
	["a fired blocker's id", "invalid-stage", [FINISHED]],
	["a replay's fired blocker id", "Contradicts", [REPLAY]],
	["a group's fired blocker id", "material-decision", [GROUP]],
	[
		"a launch's case",
		"new-case",
		[
			`launch ${RUNNING_LAUNCH.slice(PREFIX_START_INDEX, LAUNCH_ID_PREVIEW_CHARACTERS)}`,
		],
	],
] as const;

async function renderHistory(
	body: RunHistoryResponseBody = new FilteredHistoryBuilder().build(),
): Promise<{
	readonly page: RenderResult;
	readonly listed: () => readonly string[];
	readonly pressed: () => readonly (string | null)[];
	readonly search: (text: string) => void;
}> {
	respondingWith(body);
	const page = renderPage();
	await page.findByRole("button", {
		name: `All ${String(body.rows.length + body.launches.length)}`,
	});
	await waitFor(() => {
		const expectedMatchingElementsCount = 0;

		expect(page.queryAllByText("Checking freshness…")).toHaveLength(
			expectedMatchingElementsCount,
		);
	});

	return {
		listed: () =>
			EVERY_RECORD.filter((name) => page.queryByText(name) !== null),
		page,
		pressed: () =>
			within(page.container)
				.getAllByRole("button", { pressed: true })
				.map((pill) => pill.textContent),
		search: (text) => {
			fireEvent.change(page.getByRole("searchbox", { name: "Search runs" }), {
				target: { value: text },
			});
		},
	};
}

async function testLabelsComposableStatusKindAndCorpusFiltersWithTheCompleteEntryCount(): Promise<void> {
	const { page, pressed } = await renderHistory();

	const pills = within(page.container)
		.getAllByRole("button")
		.filter((button) => button.hasAttribute("aria-pressed"));

	expect(pills.map((pill) => pill.textContent)).toEqual([
		"All 8",
		"Running",
		"Ended",
		"Passed",
		"Failed",
		"Stopped",
		"All kinds",
		"Tasks",
		"Sessions",
		"Replays",
		"Groups",
		"All corpora",
		"Current corpus",
		"Stale corpus",
	]);
	expect(pressed()).toEqual(["All 8", "All kinds", "All corpora"]);
}

async function testLabelsTheSearchFieldAndHintsAtWhatItMatches(): Promise<void> {
	const { page } = await renderHistory();

	expect(page.getByRole("searchbox", { name: "Search runs" })).toHaveAttribute(
		"placeholder",
		"run id, case, corpus hash, blocker id",
	);
}

async function testListsOnlyTheRecordsBothTheSelectedFilterAndTheSearchMatch(): Promise<void> {
	const { page, listed, search } = await renderHistory();
	fireEvent.click(page.getByRole("button", { name: "Running" }));

	search("c0ffee");

	expect(listed()).toEqual([IN_FLIGHT]);
}

async function testSaysSoRatherThanShowingTheEmptyInstallSState(): Promise<void> {
	const { page, listed, search } = await renderHistory();

	search("no-such-blocker");

	expect(listed()).toEqual([]);
	expect(
		page.getByText("No record matches this filter and search."),
	).toBeInTheDocument();
	expect(page.queryByText("No runs recorded")).not.toBeInTheDocument();
}

async function testCountsALaunchAsARecordTheFilterCanHide(): Promise<void> {
	const { page } = await renderHistory({
		...new FilteredHistoryBuilder().build(),
		rows: [],
	});

	fireEvent.click(page.getByRole("button", { name: "Stopped" }));

	expect(
		page.getByText("No record matches this filter and search."),
	).toBeInTheDocument();
	expect(page.queryByText("No runs recorded")).not.toBeInTheDocument();
}

async function testComposesFilter(
	filter: string,
	expected: readonly string[],
): Promise<void> {
	const { page, pressed } = await renderHistory();

	fireEvent.click(page.getByRole("button", { name: filter }));

	expect(pressed()).toEqual(expected);
}

async function testFiltersListedRecords(
	filter: string,
	expected: readonly string[],
): Promise<void> {
	const { page, listed } = await renderHistory();

	fireEvent.click(page.getByRole("button", { name: filter }));

	expect(listed()).toEqual(expected);
}

async function testSearchesListedRecords(
	_key: string,
	text: string,
	expected: readonly string[],
): Promise<void> {
	const { listed, search } = await renderHistory();

	search(text);

	expect(listed()).toEqual(expected);
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("the filter bar and search", () => {
		/** The page over every kind of record, read as the names it lists. */

		it(
			"labels composable status, kind and corpus filters with the complete entry count",
			testLabelsComposableStatusKindAndCorpusFiltersWithTheCompleteEntryCount,
		);

		it.each(COMPOSABLE_FILTERS)(
			"marks %s without clearing a different filter dimension",
			testComposesFilter,
		);

		it.each(FILTER_RESULTS)(
			"lists under %s only the records it names",
			testFiltersListedRecords,
		);

		it(
			"labels the search field and hints at what it matches",
			testLabelsTheSearchFieldAndHintsAtWhatItMatches,
		);

		it.each(SEARCH_RESULTS)(
			"lists by %s only the records it matches",
			testSearchesListedRecords,
		);

		it(
			"lists only the records both the selected filter and the search match",
			testListsOnlyTheRecordsBothTheSelectedFilterAndTheSearchMatch,
		);

		describe("when no record matches", () => {
			it(
				"says so rather than showing the empty install's state",
				testSaysSoRatherThanShowingTheEmptyInstallSState,
			);

			it(
				"counts a launch as a record the filter can hide",
				testCountsALaunchAsARecordTheFilterCanHide,
			);
		});
	});
});
