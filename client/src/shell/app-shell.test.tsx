import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import createAppRouter from "#client/router";

import NAV_ITEMS from "./nav-items";
import {
	NAV_LABEL,
	SPEC_NAV_LABELS,
	originalFetch,
	renderShellAt,
} from "./shell-test-fixtures";
import { CHORD_DESTINATIONS } from "./use-go-to-shortcut";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the navigation shell", () => {
	it(
		"lists the workspace's five destinations in order",
		listsTheWorkspaceSFiveDestinationsInOrder,
	);

	it("links every section to its screen", linksEverySectionToItsScreen);

	it(
		"reaches the settings screen from the rail",
		reachesTheSettingsScreenFromTheRail,
	);

	it(
		"answers an unknown address inside the shell, naming it",
		answersAnUnknownAddressInsideTheShellNamingIt,
	);

	it(
		"says Run detail has no run to open until a run is recorded",
		saysRunDetailHasNoRunToOpenUntilARunIsRecorded,
	);

	it(
		"sends every nav item and chord to a route the router serves",
		sendsEveryNavItemAndChordToARouteTheRouterServes,
	);

	it(
		"leads from the landing screen to the corpus screen",
		leadsFromTheLandingScreenToTheCorpusScreen,
	);
});

async function listsTheWorkspaceSFiveDestinationsInOrder(): Promise<void> {
	renderShellAt("/");

	const nav = await screen.findByRole("navigation", { name: "Sections" });
	const labels = within(nav)
		.getAllByText(NAV_LABEL)
		.map((label) => label.textContent);

	expect(labels).toEqual(SPEC_NAV_LABELS);
}

async function linksEverySectionToItsScreen(): Promise<void> {
	renderShellAt("/");

	const nav = await screen.findByRole("navigation", { name: "Sections" });
	const linked = within(nav)
		.getAllByRole("link")
		.map((link) => within(link).getByText(NAV_LABEL).textContent);

	expect(linked).toEqual(SPEC_NAV_LABELS);
}

async function reachesTheSettingsScreenFromTheRail(): Promise<void> {
	renderShellAt("/");
	const nav = await screen.findByRole("navigation", { name: "Sections" });

	fireEvent.click(within(nav).getByRole("link", { name: /^Settings/u }));

	expect(
		await screen.findByRole("heading", { name: "Settings" }),
	).toBeInTheDocument();
}

async function answersAnUnknownAddressInsideTheShellNamingIt(): Promise<void> {
	renderShellAt("/no-such-screen", { corpusFiles: 137, runs: 0 });

	await waitFor(() => {
		expect(
			screen.getByRole("navigation", { name: "Sections" }),
		).toBeInTheDocument();
	});

	expect(
		screen.getByRole("region", { name: "Corpus under test" }),
	).toBeInTheDocument();
	expect(screen.getByText(/\/no-such-screen/u)).toBeInTheDocument();
	expect(screen.queryByText("Not Found")).not.toBeInTheDocument();
	expect(screen.getByRole("link", { name: /Back to Runs/u })).toHaveAttribute(
		"href",
		"/",
	);
}

async function saysRunDetailHasNoRunToOpenUntilARunIsRecorded(): Promise<void> {
	renderShellAt("/runs", { corpusFiles: 0, runs: 0, sessionAttempts: 1 });

	expect(
		await screen.findByText(
			"No run is recorded yet, so there is no run detail to open.",
		),
	).toBeInTheDocument();
	expect(screen.queryByText("planned")).toBeNull();
}

function sendsEveryNavItemAndChordToARouteTheRouterServes(): void {
	const lowerBoundForDestinationsCount = 0;

	const served = new Set<string>(
		Object.values(createAppRouter().routesById).map((route) => route.fullPath),
	);
	const destinations: string[] = [
		...NAV_ITEMS.map((item) => item.path),
		...CHORD_DESTINATIONS.values(),
	];

	expect(destinations.length).toBeGreaterThan(lowerBoundForDestinationsCount);
	for (const path of destinations) {
		expect(served.has(path)).toBe(true);
	}
}

async function leadsFromTheLandingScreenToTheCorpusScreen(): Promise<void> {
	renderShellAt("/");

	await waitFor(() => {
		expect(screen.getByRole("link", { name: /Corpus/u })).toHaveAttribute(
			"href",
			"/corpus",
		);
	});
}
