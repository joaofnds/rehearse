import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";

import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import {
	HISTORY_CACHE_EXPIRY_MS,
	copyHistoryReadCache,
	originalFetch,
	renderPage,
} from "./history-page-test-fixtures";
import { SessionHistoryPage } from "./session-history-page";

let retainedClient: QueryClient | null = null;
let returningClient: QueryClient | null = null;

afterEach(() => {
	jest.useRealTimers();
	globalThis.fetch = originalFetch;
	retainedClient = null;
	returningClient = null;
});
describe(SessionHistoryPage.name, () => {
	it(
		"retains a non-default selected request across evidence-view switches",
		retainsANonDefaultSelectedRequestAcrossEvidenceViewSwitches,
	);

	describe("after warming history reads", inactiveCachedHistory);

	describe("after leaving a selected history record", returnedHistoryContext);
});

async function retainsANonDefaultSelectedRequestAcrossEvidenceViewSwitches(): Promise<void> {
	renderPage();
	fireEvent.click(await screen.findByRole("button", { name: "Requests" }));
	const timeline = await screen.findByRole("listbox", {
		name: "Request timeline",
	});
	expect(
		within(timeline).getByRole("option", { selected: true }),
	).toHaveTextContent("req-first");
	fireEvent.click(
		within(timeline).getByRole("option", { name: /req-second/u }),
	);

	fireEvent.click(screen.getByRole("button", { name: "Evidence" }));
	fireEvent.click(screen.getByRole("button", { name: "Requests" }));

	const returned = screen.getByRole("listbox", { name: "Request timeline" });
	expect(
		within(returned).getByRole("option", { selected: true }),
	).toHaveTextContent("req-second");
	expect(
		screen.getByRole("region", { name: "Selected request" }),
	).toHaveTextContent("req-second");
}

function inactiveCachedHistory(): void {
	beforeEach(warmsHistoryReads);
	describe("with a remembered source and request", rememberedHistorySelection);
}
function rememberedHistorySelection(): void {
	beforeEach(remembersHistorySelection);
	it(
		"retains source and selected request after six inactive minutes and remounting",
		restoresInactiveHistorySelection,
	);
}
async function warmsHistoryReads(): Promise<void> {
	const warmed = renderPage();
	fireEvent.click(await screen.findByRole("button", { name: "Requests" }));
	await screen.findByRole("listbox", { name: "Request timeline" });
	warmed.unmount();
	jest.useFakeTimers();
	retainedClient = copyHistoryReadCache(warmed.client);
}
function remembersHistorySelection(): void {
	if (retainedClient === null) {
		throw new Error("History reads were not warmed");
	}
	const mounted = render(
		<QueryClientProvider client={retainedClient}>
			<SessionHistoryPage
				identity={{ caseId: "case-a", kind: "standalone", uuid: "attempt-a" }}
			/>
		</QueryClientProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: /CLAUDE.md/u }));
	fireEvent.click(screen.getByRole("button", { name: "Requests" }));
	fireEvent.click(
		within(screen.getByRole("listbox", { name: "Request timeline" })).getByRole(
			"option",
			{ name: /req-first/u },
		),
	);
	mounted.unmount();
}
async function restoresInactiveHistorySelection(): Promise<void> {
	if (retainedClient === null) {
		throw new Error("History reads were not warmed");
	}
	act(() => {
		jest.advanceTimersByTime(HISTORY_CACHE_EXPIRY_MS);
	});
	jest.useRealTimers();
	render(
		<QueryClientProvider client={retainedClient}>
			<SessionHistoryPage
				identity={{ caseId: "case-a", kind: "standalone", uuid: "attempt-a" }}
			/>
		</QueryClientProvider>,
	);
	expect(
		await screen.findByRole("button", { name: "Requests", pressed: true }),
	).toBeVisible();
	expect(screen.getByRole("button", { name: /CLAUDE.md/u })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	const requests = await screen.findByRole("listbox", {
		name: "Request timeline",
	});
	expect(
		within(requests).getByRole("option", { selected: true }).textContent,
	).toContain("req-first");
	retainedClient.clear();
}

function returnedHistoryContext(): void {
	beforeEach(remembersHistoryBeforeNavigation);
	it(
		"restores the same record's source and reading when returning to context",
		restoresHistoryAfterNavigation,
	);
}
async function remembersHistoryBeforeNavigation(): Promise<void> {
	const { client, unmount } = renderPage();
	returningClient = client;
	fireEvent.click(await screen.findByRole("button", { name: /CLAUDE.md/u }));
	fireEvent.keyDown(screen.getByRole("listbox", { name: "Attempt events" }), {
		key: "j",
	});
	fireEvent.click(screen.getByRole("button", { name: "Requests" }));
	await screen.findByRole("listbox", { name: "Request timeline" });
	unmount();
}
async function restoresHistoryAfterNavigation(): Promise<void> {
	const expectedOptionCount = 2;
	if (returningClient === null) {
		throw new Error("History was not opened before navigation");
	}
	render(
		<QueryClientProvider client={returningClient}>
			<SessionHistoryPage
				identity={{ caseId: "case-a", kind: "standalone", uuid: "attempt-a" }}
			/>
		</QueryClientProvider>,
	);
	expect(
		await screen.findByRole("button", { name: "Requests", pressed: true }),
	).toBeVisible();
	expect(screen.getByRole("button", { name: /CLAUDE.md/u })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	expect(
		within(screen.getByRole("listbox", { name: "Attempt events" })).getByRole(
			"option",
			{ selected: true },
		),
	).toHaveTextContent("CLAUDE.md delivered");
	expect(
		within(
			screen.getByRole("listbox", { name: "Request timeline" }),
		).getAllByRole("option"),
	).toHaveLength(expectedOptionCount);
}
