import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";

import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import {
	HISTORY_CACHE_EXPIRY_MS,
	agentTreeNav,
	originalFetch,
	renderFixturePage,
} from "#client/test-support/session-history/agent-tree-test-fixtures";

import { copyHistoryReadCache } from "./history-page-test-fixtures";
import { SessionHistoryPage } from "./session-history-page";

let retainedClient: QueryClient | null = null;

afterEach(() => {
	jest.useRealTimers();
	globalThis.fetch = originalFetch;
});

describe("agent tree in the saved-attempt workbench", () => {
	describe("after a selected child agent is unmounted", () => {
		beforeEach(warmsAndSelectsRetainedAgent);
		it(
			"retains a child agent after six inactive minutes and remounting",
			retainsAChildAgentAfterSixInactiveMinutesAndRemounting,
		);
	});

	it(
		"nests each agent under the agent that launched it",
		nestsEachAgentUnderTheAgentThatLaunchedIt,
	);

	it(
		"lists an agent whose recorded parent is not in the tree",
		listsAnAgentWhoseRecordedParentIsNotInTheTree,
	);
});

async function warmsAndSelectsRetainedAgent(): Promise<void> {
	const warmed = await renderFixturePage();
	await agentTreeNav();
	warmed.unmount();
	jest.useFakeTimers();
	retainedClient = copyHistoryReadCache(warmed.client);

	const mounted = render(
		<QueryClientProvider client={retainedClient}>
			<SessionHistoryPage
				identity={{ caseId: "case-a", kind: "standalone", uuid: "attempt-a" }}
			/>
		</QueryClientProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Agents" }));
	fireEvent.click(
		within(screen.getByRole("navigation", { name: "Agent tree" })).getByRole(
			"button",
			{ name: /^a1 · reviewer/u },
		),
	);
	mounted.unmount();
}

async function retainsAChildAgentAfterSixInactiveMinutesAndRemounting(): Promise<void> {
	const client = retainedClient;
	if (client === null) {
		throw new Error("retained tree setup did not run");
	}
	act(() => {
		jest.advanceTimersByTime(HISTORY_CACHE_EXPIRY_MS);
	});
	jest.useRealTimers();
	render(
		<QueryClientProvider client={client}>
			<SessionHistoryPage
				identity={{ caseId: "case-a", kind: "standalone", uuid: "attempt-a" }}
			/>
		</QueryClientProvider>,
	);
	expect(
		await screen.findByRole("button", { name: "Agents", pressed: true }),
	).toBeVisible();
	const detail = await screen.findByRole("region", {
		name: "Selected in the agent tree",
	});
	expect(
		within(detail).getByRole("definition", { name: "Agent" }),
	).toHaveTextContent("a1");
	client.clear();
}

async function nestsEachAgentUnderTheAgentThatLaunchedIt(): Promise<void> {
	await renderFixturePage();

	const nav = await agentTreeNav();

	const a2 = within(nav).getByRole("listitem", { name: /^a2/u });
	expect(within(a2).getByRole("button", { name: /^a3/u })).toBeInTheDocument();
	expect(
		within(nav).getByRole("button", { name: /^a1 · reviewer/u }),
	).toBeInTheDocument();
	expect(
		within(nav).getByRole("button", { name: /^Skill review\b/u }),
	).toBeInTheDocument();
}

async function listsAnAgentWhoseRecordedParentIsNotInTheTree(): Promise<void> {
	await renderFixturePage("orphaned");

	const nav = await agentTreeNav();

	expect(
		within(nav).getByRole("button", {
			name: /^a3 · Explore · Find the docs · parent zz9 not linked to the root/u,
		}),
	).toBeInTheDocument();
}
