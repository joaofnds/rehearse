import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import { renderAppWithStub } from "#client/test-support/render-app";

import CorpusPage from "./corpus-page";
import {
	CURRENT,
	PREVIOUS,
	measuredCorpus,
} from "./corpus-report-test-fixtures";
import { LIVE_SETTINGS, originalFetch } from "./corpus-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(CorpusPage.name, () => {
	describe("when the last edit was measured", () => {
		it(
			"counts the recorded results it invalidated and links to them in run history",
			countsTheRecordedResultsItInvalidatedAndLinksToThemInRunHistory,
		);

		it(
			"says no recorded result was invalidated and names the version the edit started from",
			saysNoRecordedResultWasInvalidatedAndNamesTheVersionTheEditStartedFrom,
		);

		it(
			"explains why a file's prior-version count can exceed results newly invalidated by the last edit",
			explainsWhyAFileSPriorVersionCountCanExceedResultsNewlyInvalidatedByTheLastEdit,
		);

		it.each([
			{ expected: "✓ 0 results", invalidated: 0 },
			{ expected: "⚠ 1 result", invalidated: 1 },
			{ expected: "⚠ 23 results", invalidated: 23 },
		])(
			"reads %d invalidated results of a file as %s",
			async ({ invalidated, expected }) => {
				renderAppWithStub(
					"/corpus",
					new Map<string, unknown>([
						["/api/corpus", measuredCorpus({ invalidated, rows: [] })],
						["/api/settings", LIVE_SETTINGS],
					]),
				);

				const path = await screen.findByText("CLAUDE.md");
				const row = path.closest("tr");

				expect(row).not.toBeNull();
				expect(
					within(row ?? document.body)
						.getAllByRole("cell")
						.map(({ textContent }) => textContent),
				).toContain(expected);
			},
		);
	});
});

async function countsTheRecordedResultsItInvalidatedAndLinksToThemInRunHistory(): Promise<void> {
	renderAppWithStub(
		"/corpus",
		new Map<string, unknown>([
			[
				"/api/corpus",
				measuredCorpus({
					invalidated: 2,
					rows: ["run:2026-09-12T00-00-00.000Z", "group:group-a"],
				}),
			],
			["/api/settings", LIVE_SETTINGS],
		]),
	);

	const card = await screen.findByRole("region", {
		name: "Invalidated by the last edit",
	});

	expect(within(card).getByText(/2 recorded results/u)).toBeInTheDocument();
	expect(
		within(card).getByRole("link", { name: "review them" }),
	).toHaveAttribute("href", `/?invalidatedBy=${PREVIOUS}..${CURRENT}`);
}

async function saysNoRecordedResultWasInvalidatedAndNamesTheVersionTheEditStartedFrom(): Promise<void> {
	renderAppWithStub(
		"/corpus",
		new Map<string, unknown>([
			["/api/corpus", measuredCorpus({ invalidated: 0, rows: [] })],
			["/api/settings", LIVE_SETTINGS],
		]),
	);

	const card = await screen.findByRole("region", {
		name: "Invalidated by the last edit",
	});

	expect(card).toHaveTextContent(
		"No recorded result invalidated by the edit from corpus@e73e56",
	);
	expect(within(card).queryByRole("link")).toBeNull();
}

async function explainsWhyAFileSPriorVersionCountCanExceedResultsNewlyInvalidatedByTheLastEdit(): Promise<void> {
	renderAppWithStub(
		"/corpus",
		new Map<string, unknown>([
			["/api/corpus", measuredCorpus({ invalidated: 23, rows: [] })],
			["/api/settings", LIVE_SETTINGS],
		]),
	);

	const card = await screen.findByRole("region", {
		name: "Invalidated by the last edit",
	});
	const file = await screen.findByRole("button", {
		name: "View CLAUDE.md",
	});

	expect(card).toHaveTextContent("No recorded result invalidated");
	expect(file.closest("tr")).toHaveTextContent("23 results");
	expect(
		screen.getByRole("columnheader", { name: "Prior-version results" }),
	).toBeInTheDocument();
	fireEvent.click(
		screen.getByText("What do Read by and prior-version counts mean?"),
	);
	expect(
		screen.getByText(
			/These rows can include results already stale before the last edit/u,
		),
	).toBeVisible();
	expect(screen.getByText(/This includes declared capture/u)).toBeVisible();
}
