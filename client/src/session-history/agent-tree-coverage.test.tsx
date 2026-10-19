import { afterEach, describe, expect, it, jest } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

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
		"marks coverage and the attempt total incomplete when a child's evidence is missing",
		marksCoverageAndTheAttemptTotalIncompleteWhenAChildSEvidenceIsMissing,
	);

	it(
		"reads an inherited agent's missing transcript as outside coverage",
		readsAnInheritedAgentSMissingTranscriptAsOutsideCoverage,
	);

	it(
		"labels the root's inherited-prefix requests and keeps them out of its peak",
		labelsTheRootSInheritedPrefixRequestsAndKeepsThemOutOfItsPeak,
	);

	it(
		"reads an inherited agent's tokens and cost as outside the attempt",
		readsAnInheritedAgentSTokensAndCostAsOutsideTheAttempt,
	);
});

async function marksCoverageAndTheAttemptTotalIncompleteWhenAChildSEvidenceIsMissing(): Promise<void> {
	await renderFixturePage();

	const nav = await agentTreeNav();

	expect(
		within(nav).getByRole("button", { name: /^a4 · evidence unavailable/u }),
	).toBeInTheDocument();
	expect(
		within(nav).getByRole("button", {
			name: "a6 · evidence unavailable · inherited",
		}),
	).toBeInTheDocument();
	expect(
		screen.getByRole("status", { name: "Agent coverage" }),
	).toHaveTextContent("Incomplete coverage · 1 missing transcript");
	fireEvent.click(screen.getByText("Coverage and cost details"));
	expect(screen.getByText(/no kept transcript for a4/u)).toBeVisible();
	expect(
		screen.getByRole("status", { name: "Calculated attempt total" }),
	).toHaveTextContent("Incomplete");
}

async function readsAnInheritedAgentSMissingTranscriptAsOutsideCoverage(): Promise<void> {
	await renderFixturePage();

	const detail = await select("a6 ");

	expect(
		within(detail).getByRole("definition", { name: "Evidence" }),
	).toHaveTextContent(
		"ran in the inherited prefix, so coverage and the attempt's totals leave it out",
	);
}

async function labelsTheRootSInheritedPrefixRequestsAndKeepsThemOutOfItsPeak(): Promise<void> {
	await renderFixturePage();

	const detail = await select("Session root");

	expect(
		within(detail).getByRole("list", { name: "Context history" }),
	).toHaveTextContent("line 2 · inherited prefix");
	expect(
		within(detail).getByRole("definition", { name: "Context peak" }),
	).toHaveTextContent("over the attempt's requests");
}

async function readsAnInheritedAgentSTokensAndCostAsOutsideTheAttempt(): Promise<void> {
	await renderFixturePage();

	const detail = await select("a0 ");

	expect(
		within(detail).getByRole("definition", { name: "Token categories" }),
	).toHaveTextContent("Not part of the attempt");
	expect(
		within(detail).getByRole("list", { name: "Load evidence" }),
	).toHaveTextContent("CLAUDE.md · delivery 1 · event 3:1");
	expect(
		within(detail).getByRole("definition", { name: "Cost" }),
	).toHaveTextContent("ran in the inherited prefix, before the attempt");
	expect(
		within(detail).getByRole("definition", { name: "Cost" }),
	).not.toHaveTextContent("unavailable");
}
