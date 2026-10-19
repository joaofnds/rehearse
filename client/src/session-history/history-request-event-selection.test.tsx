import { afterEach, describe, expect, it, jest } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import {
	FOURTH_REQUEST_OPTION_INDEX,
	eventAtLine,
	originalFetch,
	ownershipEntries,
	renderPage,
	textOnlyReply,
} from "./history-page-test-fixtures";
import {
	SessionHistoryPage,
	eventForRequestRow,
	requestRowsOwningEvents,
} from "./session-history-page";

afterEach(() => {
	jest.useRealTimers();
	globalThis.fetch = originalFetch;
});
describe(SessionHistoryPage.name, () => {
	it(
		"selects the request whose evidence the event pane is showing",
		selectsTheRequestWhoseEvidenceTheEventPaneIsShowing,
	);

	it(
		"selects an event when its request is picked on the timeline",
		selectsAnEventWhenItsRequestIsPickedOnTheTimeline,
	);

	it(
		"narrows the timeline to the requests a selected source's events belong to",
		narrowsTheTimelineToTheRequestsASelectedSourceSEventsBelongTo,
	);
});

describe(requestRowsOwningEvents.name, () => {
	it(
		"keeps a request whose events all sit on later lines than its own",
		keepsARequestWhoseEventsAllSitOnLaterLinesThanItsOwn,
	);

	it(
		"drops a request no visible event belongs to",
		dropsARequestNoVisibleEventBelongsTo,
	);
});

describe(eventForRequestRow.name, () => {
	it(
		"selects nothing for a request that recorded no event of its own",
		selectsNothingForARequestThatRecordedNoEventOfItsOwn,
	);

	it(
		"selects the first event the request owns, not the next request's",
		selectsTheFirstEventTheRequestOwnsNotTheNextRequestS,
	);
});

async function selectsTheRequestWhoseEvidenceTheEventPaneIsShowing(): Promise<void> {
	renderPage();
	fireEvent.click(await screen.findByRole("button", { name: "Requests" }));
	await screen.findByRole("listbox", { name: "Request timeline" });
	const ledger = screen.getByRole("listbox", { name: "Attempt events" });

	fireEvent.change(screen.getByRole("combobox", { name: "Show events" }), {
		target: { value: "All records" },
	});
	const thirdEvent = within(ledger).getByRole("option", {
		name: /Unclassified recorded content/u,
	});
	fireEvent.click(thirdEvent);
	fireEvent.click(screen.getByRole("button", { name: "Requests" }));

	await waitFor(() => {
		const expectedRowCount = 1;

		const rows = screen
			.getByRole("listbox", { name: "Request timeline" })
			.querySelectorAll('[aria-selected="true"]');
		const [observedFirstRow] = rows;

		expect(rows).toHaveLength(expectedRowCount);
		expect(observedFirstRow).toHaveTextContent("req-second");
	});
}

async function selectsAnEventWhenItsRequestIsPickedOnTheTimeline(): Promise<void> {
	renderPage();
	fireEvent.click(await screen.findByRole("button", { name: "Requests" }));
	const timeline = await screen.findByRole("listbox", {
		name: "Request timeline",
	});

	const fourthRow = within(timeline)
		.getAllByRole("option")
		.at(FOURTH_REQUEST_OPTION_INDEX);
	if (fourthRow === undefined) {
		throw new Error("the fixture records fewer than four requests");
	}
	fireEvent.click(fourthRow);

	await waitFor(() => {
		const ledger = screen.getByRole("listbox", { name: "Attempt events" });
		expect(
			within(ledger)
				.getAllByRole("option")
				.find((option) => option.getAttribute("aria-selected") === "true"),
		).toHaveTextContent("Bash result");
	});
}

async function narrowsTheTimelineToTheRequestsASelectedSourceSEventsBelongTo(): Promise<void> {
	renderPage();
	fireEvent.click(await screen.findByRole("button", { name: "Requests" }));
	await screen.findByRole("listbox", { name: "Request timeline" });

	fireEvent.click(screen.getByRole("button", { name: /CLAUDE.md/u }));
	fireEvent.click(screen.getByRole("button", { name: "Requests" }));

	await waitFor(() => {
		const expectedOptionCount = 2;

		expect(
			within(
				screen.getByRole("listbox", { name: "Request timeline" }),
			).getAllByRole("option"),
		).toHaveLength(expectedOptionCount);
	});
}

function keepsARequestWhoseEventsAllSitOnLaterLinesThanItsOwn(): void {
	const events = [eventAtLine({ line: 12 }), eventAtLine({ line: 13 })];

	const owning = requestRowsOwningEvents(ownershipEntries, events);

	expect(owning.map(({ requestId }) => requestId)).toEqual(["req-a"]);
}

function dropsARequestNoVisibleEventBelongsTo(): void {
	const events = [eventAtLine({ line: 21 })];

	const owning = requestRowsOwningEvents(ownershipEntries, events);

	expect(owning.map(({ requestId }) => requestId)).toEqual(["req-b"]);
}

function selectsNothingForARequestThatRecordedNoEventOfItsOwn(): void {
	const events = [eventAtLine({ line: 20 })];

	expect(
		eventForRequestRow(ownershipEntries, events, textOnlyReply),
	).toBeUndefined();
}

function selectsTheFirstEventTheRequestOwnsNotTheNextRequestS(): void {
	const events = [eventAtLine({ line: 12 }), eventAtLine({ line: 20 })];

	expect(eventForRequestRow(ownershipEntries, events, textOnlyReply)?.id).toBe(
		"12:1",
	);
}
