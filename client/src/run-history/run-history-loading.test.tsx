import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { focusManager } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import {
	runHistoryReplies,
	stubFetchByPath,
} from "#client/test-support/fetch-stub";
import { SHELL_BASELINE, renderAppAt } from "#client/test-support/render-app";
import type { PendingFreshness } from "#client/test-support/run-history/history-freshness-test-fixtures";
import {
	history,
	originalFetch,
	row,
	waitingForFreshness,
} from "#client/test-support/run-history/history-freshness-test-fixtures";

import type { RunHistoryResponse } from "./run-history-query";

let refreshing: PendingFreshness | null = null;

afterEach(() => {
	refreshing?.finish();
	refreshing = null;
	globalThis.fetch = originalFetch;
	focusManager.setFocused(undefined);
});

describe("initial run history", () => {
	it.each(["current", "stale"])(
		"reports an initial list failure with the %s corpus filter",
		reportsInitialListingFailure,
	);

	it(
		"renders saved readings while freshness is pending without requesting the full reports",
		rendersSavedReadingsWhileFreshnessIsPendingWithoutRequestingTheFullReports,
	);

	it(
		"waits for a judgment before answering the current-corpus filter",
		waitsForAJudgmentBeforeAnsweringTheCurrentCorpusFilter,
	);

	it(
		"keeps saved readings visible when checking freshness fails",
		keepsSavedReadingsVisibleWhenCheckingFreshnessFails,
	);
});

async function rendersSavedReadingsWhileFreshnessIsPendingWithoutRequestingTheFullReports(): Promise<void> {
	const pending = waitingForFreshness();
	renderAppAt("/");

	const table = await screen.findByRole("table", { name: "Run history" });
	expect(within(table).getByText(row.shortId)).toBeInTheDocument();
	expect(within(table).getByText("Checking freshness…")).toBeInTheDocument();
	expect(pending.paths).not.toContain("/api/runs");
	expect(pending.paths).not.toContain("/api/corpus");

	pending.finish();
	expect(await within(table).findByText("clean")).toBeInTheDocument();
}

async function waitsForAJudgmentBeforeAnsweringTheCurrentCorpusFilter(): Promise<void> {
	const pending = waitingForFreshness();
	renderAppAt("/");
	await screen.findByRole("table", { name: "Run history" });

	fireEvent.click(screen.getByRole("button", { name: "Current corpus" }));
	await waitFor(() => {
		expect(screen.queryByRole("table", { name: "Run history" }) === null).toBe(
			true,
		);
	});
	expect(
		screen.queryByText("No record matches this filter and search."),
	).toBeNull();
	pending.finish();

	const table = await screen.findByRole("table", { name: "Run history" });
	expect(within(table).getByText("clean")).toBeInTheDocument();
}

async function refreshesCachedCleanJudgment(): Promise<void> {
	stubFetchByPath(new Map([...SHELL_BASELINE, ...runHistoryReplies(history)]));
	renderAppAt("/");
	const table = await screen.findByRole("table", { name: "Run history" });
	await within(table).findByText("clean");
	refreshing = waitingForFreshness();
	focusManager.setFocused(false);
	focusManager.setFocused(true);
	await within(table).findByText("Checking freshness…");
}

async function withdrawsACachedCleanJudgmentWhileRefreshingAndAfterAFailure(): Promise<void> {
	const pending = refreshing;
	if (pending === null) {
		throw new Error("freshness setup did not run");
	}
	const table = screen.getByRole("table", { name: "Run history" });
	expect(within(table).queryByText("clean")).toBeNull();
	pending.finish({ status: 503 });
	await within(table).findByText("Could not check run freshness");
	expect(within(table).getByText(row.shortId)).toBeInTheDocument();
	expect(within(table).queryByText("clean")).toBeNull();
}

async function withholdsFailedFreshnessFromCurrentFilter(): Promise<void> {
	const pending = refreshing;
	if (pending === null) {
		throw new Error("freshness setup did not run");
	}
	const table = screen.getByRole("table", { name: "Run history" });
	pending.finish({ status: 503 });
	await within(table).findByText("Could not check run freshness");
	fireEvent.click(screen.getByRole("button", { name: "Current corpus" }));
	await screen.findByText("No record matches this filter and search.");
	expect(screen.queryByRole("table", { name: "Run history" })).toBeNull();
}

async function refreshesReplacementRecord(): Promise<void> {
	stubFetchByPath(new Map([...SHELL_BASELINE, ...runHistoryReplies(history)]));
	renderAppAt("/");
	await screen.findByText("clean");
	const replacement: RunHistoryResponse = {
		...history,
		rows: [
			{
				...row,
				caseId: "replacement-case",
				staleness: {
					...row.staleness,
					distance: { kind: "measured", versions: 1 },
					stale: true,
				},
			},
		],
	};
	refreshing = waitingForFreshness(replacement);
	focusManager.setFocused(false);
	focusManager.setFocused(true);
	const table = await screen.findByRole("table", { name: "Run history" });
	await within(table).findByText("replacement-case");
}

async function checksAReplacementRecordAgainBeforeTreatingItAsCurrent(): Promise<void> {
	const table = screen.getByRole("table", { name: "Run history" });
	expect(within(table).getByText("Checking freshness…")).toBeInTheDocument();
	expect(within(table).queryByText("clean")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Current corpus" }));
	await waitFor(() => {
		expect(screen.queryByRole("table", { name: "Run history" }) === null).toBe(
			true,
		);
	});
	expect(
		screen.queryByText("No record matches this filter and search."),
	).toBeNull();
}

async function readsReplacementJudgmentBeforeCurrentFilter(): Promise<void> {
	const pending = refreshing;
	if (pending === null) {
		throw new Error("freshness setup did not run");
	}
	fireEvent.click(screen.getByRole("button", { name: "Current corpus" }));
	pending.finish();
	await screen.findByText("No record matches this filter and search.");
	expect(screen.queryByRole("table", { name: "Run history" })).toBeNull();
}

async function keepsSavedReadingsVisibleWhenCheckingFreshnessFails(): Promise<void> {
	const pending = waitingForFreshness();
	renderAppAt("/");
	const table = await screen.findByRole("table", { name: "Run history" });

	pending.finish({ status: 503 });

	await waitFor(() => {
		expect(
			within(table).getByText("Could not check run freshness"),
		).toBeInTheDocument();
	});
	expect(within(table).getByText(row.shortId)).toBeInTheDocument();
}

async function reportsInitialListingFailure(filter: string): Promise<void> {
	const replies = new Map(SHELL_BASELINE);
	replies.delete("/api/run-listing");
	stubFetchByPath(replies);

	renderAppAt(`/?corpus=${filter}`);

	await screen.findByText("Could not load run history.");
	expect(screen.queryByText("Loading…")).toBeNull();
}

describe("refreshing run history", () => {
	describe("while rechecking a cached clean judgment", () => {
		beforeEach(refreshesCachedCleanJudgment);
		it(
			"withdraws a cached clean judgment while refreshing and after a failure",
			withdrawsACachedCleanJudgmentWhileRefreshingAndAfterAFailure,
		);
		it(
			"withholds the current-corpus table after a freshness failure",
			withholdsFailedFreshnessFromCurrentFilter,
		);
	});
	describe("while checking a replacement record", () => {
		beforeEach(refreshesReplacementRecord);
		it(
			"checks a replacement record again before treating it as current",
			checksAReplacementRecordAgainBeforeTreatingItAsCurrent,
		);
		it(
			"answers the current-corpus filter only after the replacement judgment",
			readsReplacementJudgmentBeforeCurrentFilter,
		);
	});
});
