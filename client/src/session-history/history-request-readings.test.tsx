import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import { stubFetchByPath } from "#client/test-support/fetch-stub";

import {
	REQUEST_TIMELINE_ROWS_AT_COMPACTION,
	REQUEST_TIMELINE_ROWS_BEFORE_COMPACTION,
	originalFetch,
	renderPage,
	renderStandalonePage,
} from "./history-page-test-fixtures";
import { SessionHistoryPage } from "./session-history-page";

afterEach(() => {
	jest.useRealTimers();
	globalThis.fetch = originalFetch;
});
describe(SessionHistoryPage.name, () => {
	it(
		"shows the attempt cost reconciliation once when Requests is open",
		showsTheAttemptCostReconciliationOnceWhenRequestsIsOpen,
	);

	it(
		"shows a failed request reading once before and after opening Requests",
		showsAFailedRequestReadingOnceBeforeAndAfterOpeningRequests,
	);

	describe("recorded request rows", recordedRequestRows);

	it(
		"marks the request in flight when a compaction happened",
		marksTheRequestInFlightWhenACompactionHappened,
	);

	it(
		"names why an unpriced request carries no cost",
		namesWhyAnUnpricedRequestCarriesNoCost,
	);

	it(
		"states that the active context window is not measured",
		statesThatTheActiveContextWindowIsNotMeasured,
	);
});

async function showsTheAttemptCostReconciliationOnceWhenRequestsIsOpen(): Promise<void> {
	const expectedMatchingElementsCount = 1;

	renderPage();
	fireEvent.click(await screen.findByRole("button", { name: "Requests" }));
	await screen.findByRole("listbox", { name: "Request timeline" });

	expect(screen.getAllByText("Remaining difference")).toHaveLength(
		expectedMatchingElementsCount,
	);
	expect(screen.getAllByText("Provider reported · attempt")).toHaveLength(
		expectedMatchingElementsCount,
	);
	expect(screen.getByText("Attempt totals")).toBeInTheDocument();
}

async function showsAFailedRequestReadingOnceBeforeAndAfterOpeningRequests(): Promise<void> {
	const expectedMatchingElementsCount = 1;

	stubFetchByPath(
		new Map([
			[
				"/api/attempts/session/case-a/attempt-a/history",
				{
					attempt: {
						caseId: "case-a",
						corpusFiles: [],
						id: "attempt-a",
						kind: "session",
						model: "sonnet",
						outcome: "SUCCESSFUL",
					},
					attemptEvents: [],
					boundary: "known",
					boundaryUnknown: [],
					evidence: { state: "complete" },
					schemaVersion: 1,
					sources: [],
					startingContext: [],
					startingSources: [],
				},
			],
		]),
	);
	renderStandalonePage();
	await screen.findByText("Could not load the request timeline.");
	expect(
		screen.getAllByText("Could not load the request timeline."),
	).toHaveLength(expectedMatchingElementsCount);

	fireEvent.click(screen.getByRole("button", { name: "Requests" }));

	expect(
		screen.getAllByText("Could not load the request timeline."),
	).toHaveLength(expectedMatchingElementsCount);
}

function recordedRequestRows(): void {
	beforeEach(opensRequestTimeline);
	it(
		"shows the full row count and first attempt's usage, model and cost",
		showsFirstAttemptRequestRow,
	);
	it("keeps the next request's input independent", showsNextAttemptRequestRow);
}
async function opensRequestTimeline(): Promise<void> {
	renderPage();
	fireEvent.click(await screen.findByRole("button", { name: "Requests" }));
	await screen.findByRole("listbox", { name: "Request timeline" });
}
async function showsFirstAttemptRequestRow(): Promise<void> {
	const expectedRowCount = 5;
	const timeline = await screen.findByRole("listbox", {
		name: "Request timeline",
	});
	const rows = within(timeline).getAllByRole("option");
	const [, observedSecondRow] = rows;
	expect(rows).toHaveLength(expectedRowCount);
	expect(observedSecondRow).toHaveTextContent("286,813");
	expect(observedSecondRow).toHaveTextContent("claude-sonnet-5");
	expect(observedSecondRow).toHaveTextContent(
		"in 2 · out 151 · read 100 · write 286,711",
	);
	expect(observedSecondRow).toHaveTextContent("$1.50");
}
async function showsNextAttemptRequestRow(): Promise<void> {
	const timeline = await screen.findByRole("listbox", {
		name: "Request timeline",
	});
	const rows = within(timeline).getAllByRole("option");
	const thirdRequestRowIndex = 2;
	const observedThirdRow = rows[thirdRequestRowIndex];
	expect(observedThirdRow).toHaveTextContent("280,056");
}

async function marksTheRequestInFlightWhenACompactionHappened(): Promise<void> {
	renderPage();
	fireEvent.click(await screen.findByRole("button", { name: "Requests" }));

	const timeline = await screen.findByRole("listbox", {
		name: "Request timeline",
	});

	const rows = within(timeline).getAllByRole("option");
	const observedFourthRow = rows[REQUEST_TIMELINE_ROWS_BEFORE_COMPACTION];
	const observedFifthRow = rows[REQUEST_TIMELINE_ROWS_AT_COMPACTION];

	expect(observedFifthRow).toHaveTextContent("⇥ compaction after this request");
	expect(observedFourthRow).not.toHaveTextContent(
		"compaction after this request",
	);
}

async function namesWhyAnUnpricedRequestCarriesNoCost(): Promise<void> {
	renderPage();
	fireEvent.click(await screen.findByRole("button", { name: "Requests" }));

	const timeline = await screen.findByRole("listbox", {
		name: "Request timeline",
	});

	const rows = within(timeline).getAllByRole("option");
	const [observedFirstRow] = rows;
	const observedFifthRow = rows[REQUEST_TIMELINE_ROWS_AT_COMPACTION];

	expect(observedFifthRow).toHaveTextContent(
		"? Unpriced · a request's duplicate rows disagree on usage",
	);
	expect(observedFirstRow).toHaveTextContent(
		"? Unpriced · starting-context requests are not priced",
	);
}

async function statesThatTheActiveContextWindowIsNotMeasured(): Promise<void> {
	renderPage();
	fireEvent.click(await screen.findByRole("button", { name: "Requests" }));

	const timeline = await screen.findByRole("region", {
		name: "Request timeline",
	});

	expect(timeline).toHaveTextContent(/active context window is not measured/u);
	expect(timeline).toHaveTextContent(/own output tokens/u);
}
