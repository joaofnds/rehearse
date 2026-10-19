import { afterEach, describe, expect, it, jest } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import {
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
		"opens the selected repeated agent delivery",
		opensRepeatedDeliveryExcerpt,
	);

	it(
		"opens the receiving agents of a source only sub-agents received",
		opensTheReceivingAgentsOfASourceOnlySubAgentsReceived,
	);

	it("opens the root's own delivery excerpt", opensTheRootSOwnDeliveryExcerpt);

	it(
		"lists the agents a source reached and each delivery with its excerpt",
		listsTheAgentsASourceReachedAndEachDeliveryWithItsExcerpt,
	);
});

async function opensTheReceivingAgentsOfASourceOnlySubAgentsReceived(): Promise<void> {
	await renderFixturePage();

	const detail = await select("a1 · reviewer");
	fireEvent.click(
		within(detail).getByRole("button", {
			name: "Show the agents that received CLAUDE.md",
		}),
	);

	const receiving = await screen.findByRole("region", {
		name: "Receiving agents",
	});
	expect(
		within(receiving).getByRole("listitem", { name: /^a1/u }),
	).toHaveTextContent("1 delivery");
	expect(
		within(receiving).getByRole("listitem", { name: /^a0/u }),
	).toHaveTextContent("a0 · inherited · 1 delivery");
}

async function opensTheRootSOwnDeliveryExcerpt(): Promise<void> {
	await renderFixturePage("repeated");
	const sources = await screen.findByRole("navigation", {
		name: "Loaded sources",
	});
	fireEvent.click(within(sources).getByRole("button", { name: /CLAUDE\.md/u }));

	const receiving = await screen.findByRole("region", {
		name: "Receiving agents",
	});

	fireEvent.click(
		within(receiving).getByRole("button", {
			name: "Open excerpt of Session root's delivery 1 · event 24:1",
		}),
	);

	await waitFor(() => {
		expect(
			screen.getByRole("region", { name: "Delivery excerpt" }),
		).toHaveTextContent("Received by Session root · event 24:1");
	});
	expect(
		screen.getByRole("region", { name: "Delivery excerpt" }),
	).toHaveTextContent("project rules");
}

async function listsTheAgentsASourceReachedAndEachDeliveryWithItsExcerpt(): Promise<void> {
	await renderFixturePage("repeated");
	const sources = await screen.findByRole("navigation", {
		name: "Loaded sources",
	});
	fireEvent.click(within(sources).getByRole("button", { name: /CLAUDE\.md/u }));
	const receiving = await screen.findByRole("region", {
		name: "Receiving agents",
	});
	expect(
		within(receiving).getByRole("listitem", { name: /^Session root/u }),
	).toHaveTextContent("1 delivery");
	const a1 = within(receiving).getByRole("listitem", { name: /^a1/u });
	expect(a1).toHaveTextContent("2 deliveries · repeated");
	expect(a1).toHaveTextContent(
		"delivery 2 · event 9:1 · 15 recorded text characters, not tokens and not cost",
	);
	expect(receiving).toHaveTextContent(
		"recorded text characters, not tokens and not cost",
	);
}

async function opensRepeatedDeliveryExcerpt(): Promise<void> {
	await renderFixturePage("repeated");
	const sources = await screen.findByRole("navigation", {
		name: "Loaded sources",
	});
	fireEvent.click(within(sources).getByRole("button", { name: /CLAUDE\.md/u }));
	const receiving = await screen.findByRole("region", {
		name: "Receiving agents",
	});
	const a1 = within(receiving).getByRole("listitem", { name: /^a1/u });
	fireEvent.click(
		within(a1).getByRole("button", {
			name: "Open excerpt of a1's delivery 2 · event 9:1",
		}),
	);
	await waitFor(() => {
		expect(
			screen.getByRole("region", { name: "Delivery excerpt" }),
		).toHaveTextContent("project rules");
	});
	expect(
		screen.getByRole("region", { name: "Delivery excerpt" }),
	).toHaveTextContent("Received by a1 · event 9:1");
}
