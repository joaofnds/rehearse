import { afterEach, describe, expect, it, jest } from "bun:test";

import { within } from "@testing-library/react";

import {
	agentTreeNav,
	originalFetch,
	renderFixturePage,
	select,
} from "#client/test-support/session-history/agent-tree-test-fixtures";

afterEach(() => {
	jest.useRealTimers();
	globalThis.fetch = originalFetch;
});

describe("agent tree in the saved-attempt workbench", () => {
	it(
		"shows agent history, loads, tokens and cost basis",
		showsAgentHistoryTokensAndCost,
	);

	it(
		"shows a review agent's context, loads, model, tokens and cost with its basis",
		showsAReviewAgentSContextLoadsModelTokensAndCostWithItsBasis,
	);

	it(
		"reads an effort-tiered reviewer as a review agent",
		readsAnEffortTieredReviewerAsAReviewAgent,
	);

	it(
		"names the skills a shared remainder holds and the skill a forked agent ran",
		namesTheSkillsASharedRemainderHoldsAndTheSkillAForkedAgentRan,
	);
});

async function showsAReviewAgentSContextLoadsModelTokensAndCostWithItsBasis(): Promise<void> {
	await renderFixturePage();
	const detail = await select("a1 · reviewer");
	expect(detail).toHaveTextContent("Review agent");
	expect(detail).toHaveTextContent("not a harness role");
	expect(detail).toHaveTextContent("Context began fresh");
	expect(detail).toHaveTextContent("claude-sonnet-5");
	expect(detail).toHaveTextContent("Stopped by the user");
}

async function showsAgentHistoryTokensAndCost(): Promise<void> {
	await renderFixturePage();
	const detail = await select("a1 · reviewer");
	expect(
		within(detail).getByRole("list", { name: "Context history" }),
	).toHaveTextContent("req-a1-1");
	expect(
		within(detail).getByRole("list", { name: "Load evidence" }),
	).toHaveTextContent("CLAUDE.md");
	expect(detail).toHaveTextContent("in 5 · out 320 · read 1,500 · write 1,540");
	expect(
		within(detail).getByRole("definition", { name: "Own cost" }),
	).toHaveTextContent(
		"✓ Complete · $0.00967 · basis: every attempt request in the agent's own transcript",
	);
	expect(detail).toHaveTextContent(
		"own cost plus each descendant's total; never added into the attempt total",
	);
}

async function readsAnEffortTieredReviewerAsAReviewAgent(): Promise<void> {
	await renderFixturePage("effort-tiered");

	const detail = await select("a2 · reviewer-medium");

	expect(detail).toHaveTextContent("Review agent · agent type reviewer-medium");
}

async function namesTheSkillsASharedRemainderHoldsAndTheSkillAForkedAgentRan(): Promise<void> {
	await renderFixturePage();

	const detail = await select("Session root");

	expect(
		within(detail).getByRole("definition", { name: "Shared remainder" }),
	).toHaveTextContent("skills review-docs, verify");
	expect(
		within(await agentTreeNav()).getByRole("button", {
			name: /^a5 · advisor · skill code-review/u,
		}),
	).toBeInTheDocument();
}
