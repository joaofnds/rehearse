import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";

import agentCostAllocation from "#benchmark/agent-cost";
import agentTree from "#benchmark/agent-tree";
import type { ClaudeCallMetrics } from "#benchmark/contracts";
import { committedRateCatalog } from "#benchmark/rate-catalog";
import { sessionHistoryReport } from "#benchmark/session-history";
import { SessionHistoryPage } from "#client/session-history/session-history-page";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import type { Variant } from "#client/test-support/session-history/agent-tree-record-test-fixtures";
import {
	HISTORY,
	deliveryReplies,
	fixtureInput,
} from "#client/test-support/session-history/agent-tree-record-test-fixtures";

const HISTORY_CACHE_EXPIRY_MS = 360_000;

const QUERY_NAMESPACE_INDEX = 0;

const originalFetch = globalThis.fetch;

interface RenderedAgents {
	readonly client: QueryClient;
	readonly unmount: () => void;
}

async function renderFixturePage(
	variant: Variant = "recorded",
	modelUsage?: ClaudeCallMetrics["modelUsage"],
): Promise<RenderedAgents> {
	const input = await fixtureInput(variant);
	const tree = agentTree(input);
	const excerpts = deliveryReplies(input, tree);

	stubFetchByPath(
		new Map<string, unknown>([
			[HISTORY, sessionHistoryReport(input)],
			[
				`${HISTORY}/agents`,
				{
					cost: agentCostAllocation({
						...input,
						modelUsage,
						rates: committedRateCatalog,
					}),
					state: "available",
					tree,
				},
			],
			...excerpts,
		]),
	);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const rendered = render(
		<QueryClientProvider client={client}>
			<SessionHistoryPage
				identity={{ caseId: "case-a", kind: "standalone", uuid: "attempt-a" }}
			/>
		</QueryClientProvider>,
	);
	fireEvent.click(await screen.findByRole("button", { name: "Agents" }));
	return { client, unmount: rendered.unmount };
}

async function agentTreeNav(): Promise<HTMLElement> {
	return await screen.findByRole("navigation", { name: "Agent tree" });
}

async function select(label: string): Promise<HTMLElement> {
	const button = within(await agentTreeNav())
		.getAllByRole("button")
		.find(({ textContent }) => textContent.startsWith(label));
	if (button === undefined) {
		throw new Error(`no tree entry starts with ${label}`);
	}
	fireEvent.click(button);

	return screen.getByRole("region", { name: "Selected in the agent tree" });
}

export {
	HISTORY_CACHE_EXPIRY_MS,
	QUERY_NAMESPACE_INDEX,
	agentTreeNav,
	originalFetch,
	renderFixturePage,
	select,
};
