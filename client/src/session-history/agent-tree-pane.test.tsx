import { afterEach, describe, expect, it, jest } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { roundedCostAgents } from "#client/test-support/session-history/agent-tree-record-test-fixtures";
import {
	originalFetch,
	renderFixturePage,
	select,
} from "#client/test-support/session-history/agent-tree-test-fixtures";

import { AgentTreePane } from "./agent-tree-pane";

afterEach(() => {
	jest.useRealTimers();
	globalThis.fetch = originalFetch;
});

describe("agent tree in the saved-attempt workbench", () => {
	it(
		"rounds the attempt cost headline and keeps its exact saved amount available",
		roundsTheAttemptCostHeadlineAndKeepsItsExactSavedAmountAvailable,
	);

	it(
		"shows the provider's count beside the calculated cost for each model",
		showsTheProviderSCountBesideTheCalculatedCostForEachModel,
	);

	it(
		"shows a skill's own cost and its total including descendants",
		showsASkillSOwnCostAndItsTotalIncludingDescendants,
	);

	it(
		"reads each agent's peak from its own lane only",
		readsEachAgentSPeakFromItsOwnLaneOnly,
	);
});

async function roundsTheAttemptCostHeadlineAndKeepsItsExactSavedAmountAvailable(): Promise<void> {
	const agents = await roundedCostAgents();
	const interactions: AgentTreeInteractions = {
		openedExcerpts: [],
		selectedSources: [],
	};
	render(
		<QueryClientProvider client={new QueryClient()}>
			<AgentTreePane
				selectionKey="rounded-cost"
				agents={agents}
				sourceId={undefined}
				excerpt={null}
				onOpenExcerpt={(request) => {
					interactions.openedExcerpts.push(request.eventId);
				}}
				onSelectSource={(sourceId) => {
					interactions.selectedSources.push(sourceId);
				}}
			/>
		</QueryClientProvider>,
	);

	const total = screen.getByRole("status", {
		name: "Calculated attempt total",
	});
	expect(within(total).getByText("✓ Complete · $1.16")).toBeVisible();
	fireEvent.click(within(total).getByText("Exact measurement"));
	expect(within(total).getByText("Exact amount: $1.163421")).toBeVisible();
	expect(interactions.openedExcerpts).toEqual([]);
	expect(interactions.selectedSources).toEqual([]);
}

async function showsTheProviderSCountBesideTheCalculatedCostForEachModel(): Promise<void> {
	await renderFixturePage("recorded", {
		"claude-opus-5": {
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
			contextWindow: 0,
			costUSD: 0.5,
			inputTokens: 0,
			maxOutputTokens: 0,
			outputTokens: 0,
		},
	});

	fireEvent.click(await screen.findByText("Coverage and cost details"));
	const byModel = await screen.findByRole("list", {
		name: "Cost by model",
	});

	expect(
		within(byModel).getByRole("listitem", { name: "claude-opus-5" }),
	).toHaveTextContent(
		"claude-opus-5 · provider count ✓ Complete · $0.50 · basis: the provider's running count for the session, inherited prefix included · calculated",
	);
}

async function showsASkillSOwnCostAndItsTotalIncludingDescendants(): Promise<void> {
	await renderFixturePage();

	const detail = await select("Skill review ");

	expect(
		within(detail).getByRole("definition", { name: "Own cost" }),
	).toHaveTextContent(
		"$0.003108 over 2 requests · basis: from the skill's delivery until the next skill delivery, user prompt or interruption",
	);
	expect(
		within(detail).getByRole("definition", {
			name: "Including descendants",
		}),
	).toHaveTextContent(
		"◐ Incomplete · $0.042064 known subtotal over 7 of 8 requests",
	);
	expect(
		within(detail).getByRole("definition", {
			name: "Including descendants",
		}),
	).toHaveTextContent("sub-agents a1, a2");
}

async function readsEachAgentSPeakFromItsOwnLaneOnly(): Promise<void> {
	await renderFixturePage();

	const rootPeak = within(await select("Session root")).getByRole(
		"definition",
		{ name: "Context peak" },
	).textContent;
	const a2Peak = within(await select("a2 · reviewer")).getByRole("definition", {
		name: "Context peak",
	}).textContent;

	expect(rootPeak).toStartWith(
		"1,652 total input tokens over the attempt's requests",
	);
	expect(a2Peak).toStartWith(
		"1,803 total input tokens over the attempt's requests",
	);
	expect(a2Peak).toContain("this agent's own request input");
}

interface AgentTreeInteractions {
	readonly openedExcerpts: string[];
	readonly selectedSources: string[];
}
