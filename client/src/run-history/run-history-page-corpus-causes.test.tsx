import { describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor } from "@testing-library/react";

import { unversionedStaleness } from "#client/test-support/run-figures";

import RunHistoryPage from "./run-history-page";
import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const twoCauseRow: RunHistoryResponseBody = {
	launches: [],
	rows: [
		new PipelineRunRowBuilder({
			corpusVersion: { digest: "a3a62f", kind: "version" },
			grade: "B",
			run: "2026-09-06T21-58-29.508Z",
			stage: "shape",
			staleness: unversionedStaleness({
				causes: ["CLAUDE.md changed", "agents/advisor.md added"],
				stale: true,
			}),
			status: "STOPPED:build",
		}).build(),
	],
	unreadable: [],
};

async function testCountsTheCausesRatherThanListingThemAndKeepsThemCollapsed(): Promise<void> {
	respondingWith(twoCauseRow);

	renderPage();

	await waitFor(() => {
		expect(screen.getByRole("button", { name: "2 causes" })).toHaveAttribute(
			"aria-expanded",
			"false",
		);
	});
	expect(screen.queryByText("CLAUDE.md changed")).not.toBeInTheDocument();
}

async function testExpandsEveryCauseInPlaceWhenTheCountIsPressed(): Promise<void> {
	respondingWith(twoCauseRow);

	renderPage();

	await waitFor(() => {
		expect(
			screen.getByRole("button", { name: "2 causes" }),
		).toBeInTheDocument();
	});
	fireEvent.click(screen.getByRole("button", { name: "2 causes" }));

	expect(screen.getByText("CLAUDE.md changed")).toBeInTheDocument();
	expect(screen.getByText("agents/advisor.md added")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "hide causes" })).toHaveAttribute(
		"aria-expanded",
		"true",
	);
}

async function testDoesNotCarryOneRowSExpandedCausesOntoAnotherWhenTheFilterChangesTheRows(): Promise<void> {
	respondingWith({
		launches: [],
		rows: [
			new PipelineRunRowBuilder({
				corpusVersion: { digest: "aaaaaa", kind: "version" },
				grade: "A",
				run: "2026-09-06T00-00-00.000Z",
				stage: "build",
				staleness: unversionedStaleness({
					causes: ["CLAUDE.md changed", "agents/advisor.md added"],
					stale: true,
				}),
			}).build(),
			new PipelineRunRowBuilder({
				corpusVersion: { digest: "bbbbbb", kind: "version" },
				grade: "B",
				run: "2026-09-05T00-00-00.000Z",
				stage: "build",
				staleness: unversionedStaleness({
					causes: [
						"output-styles/brief.md changed",
						"rulebook/coupling.md added",
						"rulebook/ownership.md changed",
					],
					stale: true,
				}),
				status: "STOPPED:build",
			}).build(),
		],
		unreadable: [],
	});

	expect(
		await renderPage().findByRole("button", { name: "2 causes" }),
	).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "2 causes" }));
	fireEvent.click(screen.getByRole("button", { name: "Stopped" }));

	expect(screen.getByRole("button", { name: "3 causes" })).toHaveAttribute(
		"aria-expanded",
		"false",
	);
	expect(
		screen.queryByText("output-styles/brief.md changed"),
	).not.toBeInTheDocument();
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("when a row is stale for more than one reason", () => {
		it(
			"counts the causes rather than listing them, and keeps them collapsed",
			testCountsTheCausesRatherThanListingThemAndKeepsThemCollapsed,
		);

		it(
			"expands every cause in place when the count is pressed",
			testExpandsEveryCauseInPlaceWhenTheCountIsPressed,
		);

		it(
			"does not carry one row's expanded causes onto another when the filter changes the rows",
			testDoesNotCarryOneRowSExpandedCausesOntoAnotherWhenTheFilterChangesTheRows,
		);
	});
});
