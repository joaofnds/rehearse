import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import {
	SOURCE_EXPANSION_BUTTON_COUNT,
	originalFetch,
	renderPage,
} from "./history-page-test-fixtures";
import { SessionHistoryPage } from "./session-history-page";

afterEach(() => {
	jest.useRealTimers();
	globalThis.fetch = originalFetch;
});
describe(SessionHistoryPage.name, () => {
	it(
		"distinguishes a source search with no matches from unavailable evidence",
		distinguishesASourceSearchWithNoMatchesFromUnavailableEvidence,
	);

	describe("a searched source list", filteredSourceList);

	describe("source order and diagnostic navigation", sourceSortsAndDiagnostics);
});

async function distinguishesASourceSearchWithNoMatchesFromUnavailableEvidence(): Promise<void> {
	renderPage();
	const sources = await screen.findByRole("navigation", {
		name: "Loaded sources",
	});
	const search = screen.getByRole("searchbox", { name: "Search sources" });

	fireEvent.change(search, { target: { value: "no-source-with-this-name" } });

	expect(
		within(sources).getByText("No sources match this search."),
	).toBeVisible();
	expect(
		within(sources).queryByText(
			"No sources are available in this saved evidence.",
		),
	).not.toBeInTheDocument();
	fireEvent.change(search, { target: { value: "" } });
	expect(
		within(sources).getByRole("button", { name: /CLAUDE.md/u }),
	).toBeVisible();
}

let unfilteredSourceCount: string | null = null;
function filteredSourceList(): void {
	beforeEach(filtersSourceNames);
	it(
		"shows matching members and the All sources control",
		showsMatchingSourceMembership,
	);
	it(
		"keeps the unfiltered count and selected evidence",
		keepsUnfilteredCountAndSelectedEvidence,
	);
	it("can return to All sources from the filtered list", restoresAllSources);
}
async function filtersSourceNames(): Promise<void> {
	renderPage();
	const sources = await screen.findByRole("navigation", {
		name: "Loaded sources",
	});
	const allSources = within(sources).getByRole("button", {
		name: /All sources/u,
	});
	const originalCount = allSources.textContent;
	unfilteredSourceCount = originalCount;
	fireEvent.click(within(sources).getByRole("button", { name: /CLAUDE.md/u }));
	fireEvent.change(screen.getByRole("searchbox", { name: "Search sources" }), {
		target: { value: "late.md" },
	});
}
async function showsMatchingSourceMembership(): Promise<void> {
	const expectedButtonCount = 2;
	const sources = await screen.findByRole("navigation", {
		name: "Loaded sources",
	});
	expect(within(sources).getAllByRole("button")).toHaveLength(
		expectedButtonCount,
	);
	expect(
		within(sources).getByRole("button", { name: /late.md/u }),
	).toBeVisible();
}
function keepsUnfilteredCountAndSelectedEvidence(): void {
	const sources = screen.getByRole("navigation", { name: "Loaded sources" });
	const allSources = within(sources).getByRole("button", {
		name: /All sources/u,
	});
	const originalCount = unfilteredSourceCount;
	expect(allSources).toHaveTextContent(originalCount ?? "");
	expect(allSources).toHaveAttribute("aria-pressed", "false");
	expect(
		screen.getByText(
			"Search filters this source list. Evidence stays on the selected source.",
		),
	).toBeVisible();
}
function restoresAllSources(): void {
	const allSources = screen.getByRole("button", { name: /All sources/u });
	fireEvent.click(allSources);
	expect(allSources).toHaveAttribute("aria-pressed", "true");
}

function sourceSortsAndDiagnostics(): void {
	beforeEach(opensSourceInventory);
	it(
		"orders recorded sources by first observation",
		ordersSourcesByObservation,
	);
	it(
		"keeps partial and unavailable measurements explicit",
		qualifiesSourceMeasurements,
	);
	it(
		"orders repeated sources by their saved repetition count",
		ordersRepeatedSources,
	);
	it(
		"clears the source filter when a diagnostic selects evidence",
		opensDiagnosticEvidenceAcrossSourceFilters,
	);
	it(
		"can select saved Bash output after a diagnostic",
		opensBashAfterDiagnostic,
	);
	it(
		"explains a source whose events require raw chronology",
		explainsExternalSourceChronology,
	);
}
async function opensSourceInventory(): Promise<void> {
	renderPage();
	await screen.findByRole("heading", { name: "Saved context history" });
}
function sourceNames(): string[] {
	const sources = screen.getByRole("navigation", { name: "Loaded sources" });
	return within(sources)
		.getAllByRole("button")
		.slice(SOURCE_EXPANSION_BUTTON_COUNT)
		.map((button) => button.textContent ?? "");
}
function ordersSourcesByObservation(): void {
	const [
		observedFirstSourceName,
		observedSecondSourceName,
		observedThirdSourceName,
		observedFourthSourceName,
		observedFifthSourceName,
		observedSixthSourceName,
	] = sourceNames();
	expect(observedFirstSourceName).toContain("early.md");
	expect(observedSecondSourceName).toContain("late.md");
	expect(observedThirdSourceName).toContain("Unclassified recorded content");
	expect(observedFourthSourceName).toContain("CLAUDE.md");
	expect(observedFifthSourceName).toContain("Bash · 4:1");
	expect(observedSixthSourceName).toContain("/outside.txt");
}
function qualifiesSourceMeasurements(): void {
	const observedThirdSourceName =
		screen.getByRole("button", { name: /Unclassified recorded content/u })
			.textContent ?? "";
	const observedSixthSourceName =
		screen.getByRole("button", { name: /outside\.txt/u }).textContent ?? "";
	expect(observedThirdSourceName).toContain("≥ 20 chars · partial");
	expect(observedSixthSourceName).toContain("Size unavailable");
}
function ordersRepeatedSources(): void {
	fireEvent.click(screen.getByRole("button", { name: "Most repeated" }));
	const [observedUpdatedFirstSourceName, observedUpdatedSecondSourceName] =
		sourceNames();
	expect(observedUpdatedFirstSourceName).toContain("CLAUDE.md");
	expect(observedUpdatedSecondSourceName).toContain(
		"Unclassified recorded content",
	);
}
async function opensDiagnosticEvidenceAcrossSourceFilters(): Promise<void> {
	fireEvent.click(screen.getByRole("button", { name: "Most repeated" }));
	fireEvent.click(screen.getByRole("button", { name: /CLAUDE.md/u }));
	fireEvent.click(screen.getByRole("button", { name: /Tool error result/u }));
	await waitFor(() => {
		expect(screen.getByText("partial recorded body")).toBeInTheDocument();
	});
	expect(screen.getByRole("button", { name: /All sources/u })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	expect(screen.getByText("2026-09-14T10:00:00.000Z")).toBeInTheDocument();
	expect(screen.queryByText("undefined")).not.toBeInTheDocument();
}
async function opensBashAfterDiagnostic(): Promise<void> {
	fireEvent.click(screen.getByRole("button", { name: "Most repeated" }));
	fireEvent.click(screen.getByRole("button", { name: /CLAUDE.md/u }));
	fireEvent.click(screen.getByRole("button", { name: /Tool error result/u }));
	await screen.findByText("partial recorded body");
	fireEvent.click(screen.getByRole("button", { name: /Bash · 4:1/u }));
	await waitFor(() => {
		expect(
			screen.getByRole("heading", { name: "Saved result content" }),
		).toBeInTheDocument();
	});
}
async function explainsExternalSourceChronology(): Promise<void> {
	fireEvent.click(screen.getByRole("button", { name: "Most repeated" }));
	fireEvent.click(screen.getByRole("button", { name: /CLAUDE.md/u }));
	fireEvent.click(screen.getByRole("button", { name: /Tool error result/u }));
	await screen.findByText("partial recorded body");
	fireEvent.click(screen.getByRole("button", { name: /Bash · 4:1/u }));
	await screen.findByRole("heading", { name: "Saved result content" });
	fireEvent.click(screen.getByRole("button", { name: /outside\.txt/u }));
	expect(
		screen.getByText(
			"No events match these filters. Choose All records to include raw chronology.",
		),
	).toBeInTheDocument();
}
