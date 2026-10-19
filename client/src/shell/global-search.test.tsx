import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderAppWithStub } from "#client/test-support/render-app";

import {
	matchingInstructionReplies,
	matchingRunReplies,
	searchCollectionReplies,
} from "./search-collection-test-fixtures";

const expectedLinkCount = 1;

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("keyboard search across saved collections", () => {
	beforeEach(opensKeyboardSearch);
	it("focuses its query", focusesKeyboardSearch);
	it(
		"links each recorded destination and ranks the exact case",
		readsSearchDestinations,
	);
	it("filters to instructions", filtersSearchInstructions);
	it("closes with Escape and restores focus", closesSearchWithEscape);
});

it(
	"keeps an exact case ahead of many run matches and previews their outcome and cost",
	keepsAnExactCaseAheadOfManyRunMatchesAndPreviewsTheirOutcomeAndCost,
);

it(
	"ranks an exact instruction path above a case whose ID only starts with the query",
	ranksAnExactInstructionPathAboveACaseWhoseIDOnlyStartsWithTheQuery,
);

async function opensKeyboardSearch(): Promise<void> {
	renderAppWithStub("/", searchCollectionReplies);
	await screen.findByRole("button", { name: /Search everything/u });
	fireEvent.keyDown(document.body, { ctrlKey: true, key: "k" });
	await screen.findByRole("dialog", {
		name: "Search everything",
	});
}

async function focusesKeyboardSearch(): Promise<void> {
	const dialog = await screen.findByRole("dialog", {
		name: "Search everything",
	});
	await waitFor(() => {
		expect(within(dialog).getByRole("searchbox")).toHaveFocus();
	});
}

async function readsSearchDestinations(): Promise<void> {
	const dialog = await screen.findByRole("dialog", {
		name: "Search everything",
	});
	fireEvent.change(within(dialog).getByRole("searchbox"), {
		target: { value: "audit" },
	});
	expect(
		await within(dialog).findByRole("link", { name: /skills\/audit.md/u }),
	).toHaveAttribute("href", "/corpus?file=skills%2Faudit.md");
	expect(
		within(dialog).getByRole("link", { name: /Audit sessions/u }),
	).toHaveAttribute("href", "/cases?caseId=audit");
	expect(
		within(dialog).getByRole("link", { name: /Comparison audit-compar/u }),
	).toHaveAttribute("href", "/comparisons/audit-comparison");
	expect(within(dialog).getByRole("link", { name: /Run r2/u })).toHaveAttribute(
		"href",
		"/runs/audit-run?view=activity",
	);
	expect(
		within(dialog).getByRole("link", { name: /Replay rp/u }),
	).toHaveAttribute("href", "/replays/lineage/audit-replay");
	const [observedFirstLink] = within(dialog).getAllByRole("link");
	expect(observedFirstLink).toHaveAttribute("href", "/cases?caseId=audit");
	expect(within(dialog).getByText(/Saved metadata only/u)).toBeInTheDocument();
}

async function filtersSearchInstructions(): Promise<void> {
	const dialog = await screen.findByRole("dialog", {
		name: "Search everything",
	});
	fireEvent.change(within(dialog).getByRole("searchbox"), {
		target: { value: "audit" },
	});
	await within(dialog).findByRole("link", { name: /skills\/audit.md/u });
	fireEvent.click(within(dialog).getByRole("button", { name: "Instructions" }));
	expect(within(dialog).getAllByRole("link")).toHaveLength(expectedLinkCount);
	expect(within(dialog).getByRole("link")).toHaveAttribute(
		"href",
		"/corpus?file=skills%2Faudit.md",
	);
}

async function closesSearchWithEscape(): Promise<void> {
	const dialog = await screen.findByRole("dialog", {
		name: "Search everything",
	});
	fireEvent.change(within(dialog).getByRole("searchbox"), {
		target: { value: "audit" },
	});
	await within(dialog).findByRole("link", { name: /skills\/audit.md/u });
	fireEvent.click(within(dialog).getByRole("button", { name: "Instructions" }));
	fireEvent.keyDown(document.body, { key: "Escape" });
	await waitFor(() => {
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
	expect(
		screen.getByRole("button", { name: "Search everything" }),
	).toHaveFocus();
}

async function keepsAnExactCaseAheadOfManyRunMatchesAndPreviewsTheirOutcomeAndCost(): Promise<void> {
	renderAppWithStub("/", matchingRunReplies);
	fireEvent.click(
		await screen.findByRole("button", { name: "Search everything" }),
	);
	const dialog = await screen.findByRole("dialog", {
		name: "Search everything",
	});
	fireEvent.change(within(dialog).getByRole("searchbox"), {
		target: { value: "audit-log" },
	});
	await within(dialog).findByRole("link", { name: /Case audit-log/u });
	const [observedFirstLink] = within(dialog).getAllByRole("link");

	expect(observedFirstLink).toHaveAttribute("href", "/cases?caseId=audit-log");
	expect(
		within(dialog).getByRole("region", { name: "Runs search results" }),
	).toHaveTextContent("Final FAIL · $1.23 reported cost");
	fireEvent.click(within(dialog).getByRole("button", { name: "Cases" }));
	expect(within(dialog).getAllByRole("link")).toHaveLength(expectedLinkCount);
}

async function ranksAnExactInstructionPathAboveACaseWhoseIDOnlyStartsWithTheQuery(): Promise<void> {
	renderAppWithStub("/", matchingInstructionReplies);
	fireEvent.click(
		await screen.findByRole("button", { name: "Search everything" }),
	);
	const dialog = await screen.findByRole("dialog", {
		name: "Search everything",
	});
	fireEvent.change(within(dialog).getByRole("searchbox"), {
		target: { value: "guide" },
	});
	await within(dialog).findByRole("link", { name: /Instruction guide/u });
	expect(
		within(dialog)
			.getAllByRole("link")
			.map((link) => link.getAttribute("href")),
	).toEqual(["/corpus?file=guide", "/cases?caseId=guide-case"]);
}
