import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { stubFetchByPath } from "#client/test-support/fetch-stub";

import {
	HISTORY_EVIDENCE_GAPS,
	PARTIAL_HISTORY_REPLIES,
} from "./history-attempt-test-fixtures";
import {
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
		"selects and focuses the linked event directly",
		selectsAndFocusesTheLinkedEventDirectly,
	);

	describe("event search and raw chronology", eventSearchAndChronology);

	it(
		"keeps a long evidence-gap list behind a complete expandable summary",
		keepsALongEvidenceGapListBehindACompleteExpandableSummary,
	);

	describe("events of a selected source", selectedSourceEvents);
});

async function selectsAndFocusesTheLinkedEventDirectly(): Promise<void> {
	renderPage("2:1");
	const ledger = await screen.findByRole("region", { name: "Event ledger" });

	expect(
		within(
			within(ledger).getByRole("listbox", { name: "Attempt events" }),
		).getByRole("option", { selected: true }),
	).toHaveTextContent("CLAUDE.md delivered");
	expect(ledger).toHaveFocus();
	expect(await screen.findByText("instruction body")).toBeInTheDocument();
}

function eventSearchAndChronology(): void {
	beforeEach(opensEventHistory);
	it(
		"filters ordinary activity while raw records stay hidden",
		filtersRecordedActivity,
	);
	it(
		"recovers the raw chronology after clearing the search",
		recoversRawChronology,
	);
}
async function opensEventHistory(): Promise<void> {
	renderPage();
	await screen.findByRole("listbox", { name: "Attempt events" });
}
async function filtersRecordedActivity(): Promise<void> {
	const expectedOptionCount = 1;
	const ledger = await screen.findByRole("listbox", {
		name: "Attempt events",
	});
	expect(
		within(ledger).queryByRole("option", {
			name: /Unclassified recorded content/u,
		}),
	).not.toBeInTheDocument();
	fireEvent.change(screen.getByRole("searchbox", { name: "Search events" }), {
		target: { value: "Bash" },
	});
	expect(within(ledger).getAllByRole("option")).toHaveLength(
		expectedOptionCount,
	);
	expect(within(ledger).getByRole("option")).toHaveTextContent("Bash result");
}
async function recoversRawChronology(): Promise<void> {
	const ledger = await screen.findByRole("listbox", {
		name: "Attempt events",
	});
	fireEvent.change(screen.getByRole("searchbox", { name: "Search events" }), {
		target: { value: "Bash" },
	});
	fireEvent.change(screen.getByRole("searchbox", { name: "Search events" }), {
		target: { value: "" },
	});
	fireEvent.change(screen.getByRole("combobox", { name: "Show events" }), {
		target: { value: "All records" },
	});
	fireEvent.click(
		within(ledger).getByRole("option", {
			name: /Unclassified recorded content/u,
		}),
	);
	expect(
		within(ledger).getByRole("option", { selected: true }),
	).toHaveTextContent("Unclassified recorded content");
}

async function keepsALongEvidenceGapListBehindACompleteExpandableSummary(): Promise<void> {
	stubFetchByPath(PARTIAL_HISTORY_REPLIES);
	renderStandalonePage();

	const summary = await screen.findByText("◐ Partial · 4 evidence gaps");
	const disclosure = summary.closest("details");
	if (disclosure === null) {
		throw new Error("The gap summary has no disclosure");
	}
	expect(disclosure).not.toHaveAttribute("open");
	fireEvent.click(summary);
	expect(disclosure).toHaveAttribute("open");
	expect(
		within(disclosure)
			.getAllByRole("listitem")
			.map(({ textContent }) => textContent),
	).toEqual(HISTORY_EVIDENCE_GAPS);
}

function selectedSourceEvents(): void {
	beforeEach(opensSelectedSourceEvents);
	it("narrows the ledger to the selected source", showsSelectedSourceEvents);
	it(
		"opens delivered text and its saved snapshot with j",
		opensDeliveredSourceEvidence,
	);
	it(
		"retains selected evidence across source filters and walks back with k",
		preservesSourceSelectionAcrossFilters,
	);
}
async function opensSelectedSourceEvents(): Promise<void> {
	renderPage();
	await screen.findByRole("heading", { name: "Saved context history" });
	fireEvent.click(screen.getByRole("button", { name: /CLAUDE.md/u }));
}
function showsSelectedSourceEvents(): void {
	const expectedOptionCount = 2;
	const ledger = screen.getByRole("listbox", { name: "Attempt events" });
	expect(within(ledger).getAllByRole("option")).toHaveLength(
		expectedOptionCount,
	);
}
async function opensDeliveredSourceEvidence(): Promise<void> {
	const ledger = screen.getByRole("listbox", { name: "Attempt events" });
	fireEvent.keyDown(ledger, { key: "j" });
	await waitFor(() => {
		expect(screen.getByText("instruction body")).toBeInTheDocument();
		expect(screen.getByText("source snapshot")).toBeInTheDocument();
	});
}
async function preservesSourceSelectionAcrossFilters(): Promise<void> {
	const ledger = screen.getByRole("listbox", { name: "Attempt events" });
	fireEvent.keyDown(ledger, { key: "j" });
	await screen.findByText("instruction body");
	fireEvent.click(screen.getByRole("button", { name: /CLAUDE.md/u }));
	expect(
		within(ledger).getByRole("option", { selected: true }),
	).toHaveTextContent("CLAUDE.md delivered");
	fireEvent.click(screen.getByRole("button", { name: /All sources/u }));
	expect(
		within(ledger).getByRole("option", { selected: true }),
	).toHaveTextContent("CLAUDE.md delivered");
	fireEvent.keyDown(ledger, { key: "k" });
	expect(
		within(ledger).getByRole("option", { selected: true }),
	).toHaveTextContent("Read CLAUDE.md");
	expect(screen.getByRole("button", { name: /CLAUDE.md/u })).toHaveTextContent(
		"12 chars1 delivery · 0 repeats",
	);
}
