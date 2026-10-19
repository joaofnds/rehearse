import { describe, expect, it } from "bun:test";

import { screen, waitFor } from "@testing-library/react";

import { FakeServer } from "#client/test-support/fetch-stub";
import { unversionedStaleness } from "#client/test-support/run-figures";

import RunHistoryPage from "./run-history-page";
import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";

async function testRendersTheEmptyStateBlockWhenNoRunsAreRecorded(): Promise<void> {
	respondingWith({ launches: [], rows: [], unreadable: [] });

	renderPage();

	await waitFor(() => {
		expect(screen.getByText("No runs recorded")).toBeInTheDocument();
	});
}

async function testRendersTheHistoryNotTheQueryErrorWhenTheCorpusRefusesItsInstructionFile(): Promise<void> {
	respondingWith({
		launches: [],
		rows: [
			new PipelineRunRowBuilder({
				corpusVersion: { digest: "a3a62f", kind: "version" },
				grade: "B",
				run: "2026-09-06T21-58-29.508Z",
				stage: "build",
				staleness: unversionedStaleness({
					causes: [
						"Corpus file CLAUDE.md resolves outside the corpus source, which would hash bytes the corpus does not hold",
					],
					stale: true,
				}),
			}).build(),
		],
		unreadable: [],
	});

	renderPage();

	await waitFor(() => {
		expect(screen.getByText("2026-09-06T21-58-29.508Z")).toBeInTheDocument();
	});
	expect(screen.getByText("stale")).toBeInTheDocument();
	expect(
		screen.queryByText("Could not load run history."),
	).not.toBeInTheDocument();
}

async function testSaysTheHistoryCouldNotLoadWhenTheServerRefusesItWithAnErrorBody(): Promise<void> {
	new FakeServer(
		new Map([
			[
				"GET /api/run-listing",
				{
					body: {
						error: "The linked corpus directory <path> is no longer a corpus",
					},
					status: 409,
				},
			],
		]),
	).install();

	renderPage();

	expect(
		await screen.findByText("Could not load run history."),
	).toBeInTheDocument();
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	it(
		"renders the empty-state block when no runs are recorded",
		testRendersTheEmptyStateBlockWhenNoRunsAreRecorded,
	);
	it(
		"renders the history, not the query error, when the corpus refuses its instruction file",
		testRendersTheHistoryNotTheQueryErrorWhenTheCorpusRefusesItsInstructionFile,
	);
	it(
		"says the history could not load when the server refuses it with an error body",
		testSaysTheHistoryCouldNotLoadWhenTheServerRefusesItWithAnErrorBody,
	);
});
