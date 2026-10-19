import { afterEach, describe, expect, it } from "bun:test";

import { focusManager } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import {
	CURRENT,
	LATER,
	NAME_A,
	NAME_B,
	NAME_C,
	PREVIOUS,
	RUN_B,
	corpus,
	durableRecords,
	originalFetch,
	serving,
} from "./invalidated-history-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	focusManager.setFocused(undefined);
});

describe("/?invalidatedBy", () => {
	it(
		"lists exactly the rows the last edit invalidated after following 'review them' from the corpus screen",
		listsExactlyTheRowsTheLastEditInvalidatedAfterFollowingReviewThemFromTheCorpusScreen,
	);

	it(
		"reads the last edit again on arrival, so an edit made after the corpus screen loaded is not taken for the one the link names",
		readsTheLastEditAgainOnArrivalSoAnEditMadeAfterTheCorpusScreenLoadedIsNotTakenForTheOneTheLinkNames,
	);

	it(
		"lists no rows from the corpus report read before arrival while it is read again",
		listsNoRowsFromTheCorpusReportReadBeforeArrivalWhileItIsReadAgain,
	);

	it(
		"keeps listing the rows while the corpus report is read again on returning to the window",
		keepsListingTheRowsWhileTheCorpusReportIsReadAgainOnReturningToTheWindow,
	);

	it(
		"keeps listing the rows when a later read of run history fails",
		keepsListingTheRowsWhenALaterReadOfRunHistoryFails,
	);
});

async function listsExactlyTheRowsTheLastEditInvalidatedAfterFollowingReviewThemFromTheCorpusScreen(): Promise<void> {
	serving("/corpus");

	fireEvent.click(await screen.findByRole("link", { name: "review them" }));

	const table = await durableRecords();
	expect(within(table).getByText(NAME_A)).toBeInTheDocument();
	expect(within(table).getByText(NAME_C)).toBeInTheDocument();
	expect(within(table).queryByText(NAME_B)).toBeNull();
}

async function readsTheLastEditAgainOnArrivalSoAnEditMadeAfterTheCorpusScreenLoadedIsNotTakenForTheOneTheLinkNames(): Promise<void> {
	const { answers } = serving("/corpus");
	const link = await screen.findByRole("link", { name: "review them" });
	answers.set(
		"/api/corpus",
		corpus({
			count: 1,
			current: LATER,
			kind: "measured",
			previous: CURRENT,
			rows: [`run:${RUN_B}`],
		}),
	);

	fireEvent.click(link);

	await screen.findByText(
		/The edit this address names is no longer the last edit/u,
	);
	expect(screen.queryByText(NAME_B)).toBeNull();
}

async function listsNoRowsFromTheCorpusReportReadBeforeArrivalWhileItIsReadAgain(): Promise<void> {
	const { hold } = serving("/corpus");
	const link = await screen.findByRole("link", { name: "review them" });
	hold("/api/corpus");

	fireEvent.click(link);

	await screen.findByText("Reading the last edit…");
	expect(screen.queryByRole("table")).toBeNull();
}

async function keepsListingTheRowsWhileTheCorpusReportIsReadAgainOnReturningToTheWindow(): Promise<void> {
	const { hold, held } = serving(`/?invalidatedBy=${PREVIOUS}..${CURRENT}`);
	await durableRecords();
	hold("/api/corpus");

	focusManager.setFocused(false);
	focusManager.setFocused(true);

	await waitFor(() => {
		const expectedHeld = 1;

		expect(held()).toBe(expectedHeld);
	});
	expect(screen.getByText(NAME_A)).toBeInTheDocument();
}

async function keepsListingTheRowsWhenALaterReadOfRunHistoryFails(): Promise<void> {
	const { answers } = serving(`/?invalidatedBy=${PREVIOUS}..${CURRENT}`);
	await durableRecords();
	answers.delete("/api/run-listing");

	focusManager.setFocused(false);
	focusManager.setFocused(true);

	await screen.findByText("Could not load run history.");
	expect(screen.getByText(NAME_A)).toBeInTheDocument();
}
