import { afterEach, describe, expect, it } from "bun:test";

import { screen, waitFor } from "@testing-library/react";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import type { RunListingResponse } from "#client/run-history/run-history-query";
import { renderAppWithStub } from "#client/test-support/render-app";

import { runRow } from "./shell-record-test-fixtures";
import type { ServedShellCollections } from "./shell-record-test-fixtures";
import { originalFetch, renderShellAt } from "./shell-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the navigation shell", () => {
	it.each([
		{ comparisons: 3, corpusFiles: 137, runs: 4, unreadableComparisons: 1 },
		{ comparisons: 1, corpusFiles: 9, runs: 2, unreadableComparisons: 2 },
	])(
		"badges run history with %s, corpus with %s and comparisons with the %s readable ones, leaving out %s unreadable",
		readsShellCollectionBadges,
	);

	it(
		"badges run history with every listed record, not only pipeline runs",
		badgesRunHistoryWithEveryListedRecordNotOnlyPipelineRuns,
	);

	it(
		"badges run history with the launches its list shows beside the records",
		badgesRunHistoryWithTheLaunchesItsListShowsBesideTheRecords,
	);

	it(
		"keeps in-flight pipelines in the persistent run bar",
		keepsInFlightPipelinesInThePersistentRunBar,
	);
});

async function badgesRunHistoryWithEveryListedRecordNotOnlyPipelineRuns(): Promise<void> {
	renderShellAt("/", { corpusFiles: 0, runs: 2, sessionAttempts: 3 });

	await waitFor(() => {
		expect(screen.getByRole("link", { name: "Runs 5" })).toBeInTheDocument();
	});
}

async function badgesRunHistoryWithTheLaunchesItsListShowsBesideTheRecords(): Promise<void> {
	const listing: RunListingResponse = {
		launches: [
			{
				attempts: 1,
				caseId: "audit-log",
				id: "case-launch",
				kind: "launch",
				launchedAt: "2026-09-30T08:00:00.000Z",
				run: undefined,
				stage: undefined,
				status: "RUNNING",
				target: "case",
			},
		],
		rows: [
			runRow("2026-09-06T21-58-29.500Z"),
			runRow("2026-09-06T21-58-29.501Z"),
		],
		unreadable: [],
	};
	renderAppWithStub("/corpus", new Map([["/api/run-listing", listing]]));

	expect(
		await screen.findByRole("link", { name: "Runs 3" }),
	).toBeInTheDocument();
}

async function keepsInFlightPipelinesInThePersistentRunBar(): Promise<void> {
	const expectedRegionCount = 2;

	renderAppWithStub(
		"/corpus",
		new Map([
			[
				"/api/run-listing",
				{
					launches: [
						{
							attempts: 1,
							caseId: "audit-log",
							id: "replay-launch",
							kind: "launch",
							launchedAt: "2026-09-30T08-00-00.000Z",
							run: "2026-09-30T08-00-00.000Z",
							stage: "build",
							status: "RUNNING",
							target: "replay",
						},
					],
					rows: [
						new PipelineRunRowBuilder({ run: "2026-09-30T09-00-00.000Z" })
							.withExecutionProgress()
							.build(),
						new PipelineRunRowBuilder({ run: "2026-09-30T11-00-00.000Z" })
							.withExecutionProgress()
							.build(),
						new PipelineRunRowBuilder({ status: "COMPLETE" })
							.withExecutionProgress()
							.build(),
					],
					unreadable: [],
				},
			],
		]),
	);

	expect(
		await screen.findAllByRole("region", { name: /in flight$/u }),
	).toHaveLength(expectedRegionCount);
}

async function readsShellCollectionBadges({
	runs,
	corpusFiles,
	comparisons,
	unreadableComparisons,
}: Required<
	Pick<
		ServedShellCollections,
		"runs" | "corpusFiles" | "comparisons" | "unreadableComparisons"
	>
>): Promise<void> {
	renderShellAt("/", {
		comparisons,
		corpusFiles,
		runs,
		unreadableComparisons,
	});

	await waitFor(() => {
		expect(
			screen.getByRole("link", { name: `Runs ${runs}` }),
		).toBeInTheDocument();
	});
	expect(
		screen.getByRole("link", { name: `Corpus ${corpusFiles}` }),
	).toBeInTheDocument();
	await waitFor(() => {
		expect(
			screen.getByRole("link", { name: `Comparisons ${comparisons}` }),
		).toBeInTheDocument();
	});
}
