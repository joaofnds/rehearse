import { afterEach, describe, expect, it } from "bun:test";

import { focusManager } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import {
	BY_CASE,
	CURRENT,
	LAST_EDIT,
	NAME_A,
	NAME_B,
	NAME_C,
	PREVIOUS,
	corpus,
	durableRecords,
	originalFetch,
	searchRuns,
	serving,
} from "./invalidated-history-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	focusManager.setFocused(undefined);
});

describe("/?invalidatedBy", () => {
	it(
		"names the corpus versions the edit went from and to",
		namesTheCorpusVersionsTheEditWentFromAndTo,
	);

	it(
		"returns to every record when another filter is chosen",
		returnsToEveryRecordWhenAnotherFilterIsChosen,
	);

	it(
		"returns to every record when its own pressed filter is pressed again",
		returnsToEveryRecordWhenItsOwnPressedFilterIsPressedAgain,
	);

	describe("when searching", () => {
		it(
			"lists only the invalidated results the search matches",
			listsOnlyTheInvalidatedResultsTheSearchMatches,
		);

		it(
			"says no record matches when the search hides every invalidated result",
			saysNoRecordMatchesWhenTheSearchHidesEveryInvalidatedResult,
		);
	});

	describe("when the last edit invalidated no result", () => {
		it(
			"counts none without saying the filter and search match nothing",
			countsNoneWithoutSayingTheFilterAndSearchMatchNothing,
		);
	});
});

async function namesTheCorpusVersionsTheEditWentFromAndTo(): Promise<void> {
	serving(`/?invalidatedBy=${PREVIOUS}..${CURRENT}`);

	await durableRecords();

	expect(
		screen.getByText(
			"2 recorded results invalidated by the edit from corpus@e73e56 to corpus@a41c7e",
		),
	).toBeInTheDocument();
}

async function returnsToEveryRecordWhenAnotherFilterIsChosen(): Promise<void> {
	serving(`/?invalidatedBy=${PREVIOUS}..${CURRENT}`);
	await durableRecords();

	fireEvent.click(screen.getByRole("button", { name: "All 3" }));

	await waitFor(() => {
		expect(screen.getByText(NAME_B)).toBeInTheDocument();
	});
	expect(screen.queryByText(/invalidated by the edit from/u)).toBeNull();
}

async function returnsToEveryRecordWhenItsOwnPressedFilterIsPressedAgain(): Promise<void> {
	serving(`/?invalidatedBy=${PREVIOUS}..${CURRENT}`);
	await durableRecords();

	fireEvent.click(
		screen.getByRole("button", { name: "Invalidated by the last edit" }),
	);

	await waitFor(() => {
		expect(screen.getByText(NAME_B)).toBeInTheDocument();
	});
	expect(
		screen.queryByRole("button", { name: "Invalidated by the last edit" }),
	).toBeNull();
}

async function countsNoneWithoutSayingTheFilterAndSearchMatchNothing(): Promise<void> {
	serving(`/?invalidatedBy=${PREVIOUS}..${CURRENT}`, {
		corpus: corpus({ ...LAST_EDIT, count: 0, rows: [] }),
	});

	await screen.findByText(
		"0 recorded results invalidated by the edit from corpus@e73e56 to corpus@a41c7e",
	);

	expect(
		screen.queryByText("No record matches this filter and search."),
	).toBeNull();
}

async function listsOnlyTheInvalidatedResultsTheSearchMatches(): Promise<void> {
	serving(`/?invalidatedBy=${PREVIOUS}..${CURRENT}`, { runs: BY_CASE });
	await durableRecords();

	searchRuns("brief");

	await waitFor(() => {
		expect(screen.queryByText(NAME_A)).toBeNull();
	});
	expect(screen.getByText(NAME_C)).toBeInTheDocument();
	expect(screen.queryByText(NAME_B)).toBeNull();
}

async function saysNoRecordMatchesWhenTheSearchHidesEveryInvalidatedResult(): Promise<void> {
	serving(`/?invalidatedBy=${PREVIOUS}..${CURRENT}`, { runs: BY_CASE });
	await durableRecords();

	searchRuns("no-such-case");

	expect(
		await screen.findByText("No record matches this filter and search."),
	).toBeInTheDocument();
}
