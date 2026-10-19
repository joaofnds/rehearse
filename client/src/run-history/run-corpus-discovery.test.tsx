import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { runHistoryReplies } from "#client/test-support/fetch-stub";
import { renderAppWithStub } from "#client/test-support/render-app";

import { matchesDiscovery } from "./run-discovery";
import { originalFetch, run } from "./run-discovery-test-fixtures";

let discoveryRouter: ReturnType<typeof renderAppWithStub> | null = null;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function keepsStaleCorpusSelectionSeparateFromCurrentAndUnmeasuredCorpus(): void {
	const stale = run("old", "PASS", false);
	const current = run("current", "PASS");
	const unknown = {
		...stale,
		staleness: {
			reasons: ["No corpus measurement"],
			state: "unavailable",
		} as const,
	};

	expect(matchesDiscovery(stale, { corpus: "stale" })).toBe(true);
	expect(matchesDiscovery(current, { corpus: "stale" })).toBe(false);
	expect(matchesDiscovery(unknown, { corpus: "stale" })).toBe(false);
}

async function selectsFailedCurrentRuns(): Promise<void> {
	renderAppWithStub(
		"/",
		runHistoryReplies({
			launches: [],
			rows: [
				run("failed", "FAIL"),
				run("old", "FAIL", false),
				run("missing"),
				{ ...run("error"), status: "FAILED" },
				run("passed", "PASS"),
			],
			unreadable: [],
		}),
	);

	await screen.findByRole("table", { name: "Run history" });

	fireEvent.click(screen.getByRole("button", { name: "Failed" }));

	fireEvent.click(screen.getByRole("button", { name: "Current corpus" }));
	await screen.findByRole("table", { name: "Run history" });
}

async function intersectsFailedAndCurrentCorpusSearchesIDsAndClearsAnEmptyResult(): Promise<void> {
	await waitFor(() => {
		const expectedRowCount = 2;

		const table = screen.getByRole("table", { name: "Run history" });
		expect(within(table).getAllByRole("row")).toHaveLength(expectedRowCount);
		expect(within(table).getByText("failed")).toBeInTheDocument();
	});
}

async function clearsAndSearchesFilteredRuns(): Promise<void> {
	fireEvent.change(screen.getByRole("searchbox", { name: "Search runs" }), {
		target: { value: "no-match" },
	});
	await screen.findByText("No record matches this filter and search.");
	fireEvent.click(screen.getByRole("button", { name: "Clear" }));
	await waitFor(() => {
		const expectedRowCount = 6;

		expect(
			within(screen.getByRole("table", { name: "Run history" })).getAllByRole(
				"row",
			),
		).toHaveLength(expectedRowCount);
	});
	fireEvent.change(screen.getByRole("searchbox", { name: "Search runs" }), {
		target: { value: "audit/passed" },
	});
	await waitFor(() => {
		const expectedRowCount = 2;

		expect(
			within(screen.getByRole("table", { name: "Run history" })).getAllByRole(
				"row",
			),
		).toHaveLength(expectedRowCount);
	});
}

async function choosesDiscoveryBeforeInspecting(): Promise<void> {
	discoveryRouter = renderAppWithStub(
		"/",
		runHistoryReplies({
			launches: [],
			rows: [run("failed", "FAIL"), run("passed", "PASS")],
			unreadable: [],
		}),
	);

	await screen.findByRole("table", { name: "Run history" });

	fireEvent.click(screen.getByRole("button", { name: "Failed" }));

	fireEvent.click(screen.getByRole("button", { name: "Current corpus" }));

	fireEvent.change(screen.getByRole("combobox", { name: "Sort runs" }), {
		target: { value: "cost" },
	});

	fireEvent.change(screen.getByRole("searchbox", { name: "Search runs" }), {
		target: { value: "audit/failed" },
	});
}

async function restoresDiscoveryFromTheRunsNavigationAfterInspectingARun(): Promise<void> {
	await waitFor(() => {
		expect(discoveryRouter?.state.location.search).toMatchObject({
			corpus: "current",
			query: "audit/failed",
			sort: "cost",
			status: "failed",
		});
	});

	fireEvent.click(
		within(screen.getByRole("table", { name: "Run history" })).getByRole(
			"link",
			{ name: "failed" },
		),
	);

	await waitFor(() => {
		expect(discoveryRouter?.state.location.pathname).toBe("/runs/failed");
	});

	fireEvent.click(
		within(screen.getByRole("navigation", { name: "Sections" })).getByRole(
			"link",
			{ name: /^Runs/u },
		),
	);

	expect(
		await screen.findByRole("searchbox", { name: "Search runs" }),
	).toHaveValue("audit/failed");

	expect(screen.getByRole("button", { name: "Failed" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);

	expect(
		screen.getByRole("button", { name: "Current corpus" }),
	).toHaveAttribute("aria-pressed", "true");

	expect(screen.getByRole("combobox", { name: "Sort runs" })).toHaveValue(
		"cost",
	);
}

describe("discovering saved runs and attempts", () => {
	it(
		"keeps stale corpus selection separate from current and unmeasured corpus",
		keepsStaleCorpusSelectionSeparateFromCurrentAndUnmeasuredCorpus,
	);
	describe("with failed, current-corpus filters selected", () => {
		beforeEach(selectsFailedCurrentRuns);
		it(
			"clears an empty result and searches record identities",
			clearsAndSearchesFilteredRuns,
		);
		it(
			"intersects Failed and current corpus, searches IDs, and clears an empty result",
			intersectsFailedAndCurrentCorpusSearchesIDsAndClearsAnEmptyResult,
		);
	});
	describe("after choosing discovery filters and ordering", () => {
		beforeEach(choosesDiscoveryBeforeInspecting);
		it(
			"restores discovery from the Runs navigation after inspecting a run",
			restoresDiscoveryFromTheRunsNavigationAfterInspectingARun,
		);
	});
});
