import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";

import { screen, within } from "@testing-library/react";

import { stubFetchByPath } from "#client/test-support/fetch-stub";

import {
	originalFetch,
	renderPage,
	renderStandalonePage,
} from "./history-page-test-fixtures";
import { SessionHistoryPage } from "./session-history-page";

afterEach(() => {
	jest.useRealTimers();
	globalThis.fetch = originalFetch;
});
describe(SessionHistoryPage.name, () => {
	it(
		"keeps full provenance and starting-context lists in counted disclosures",
		keepsFullProvenanceAndStartingContextListsInCountedDisclosures,
	);

	it(
		"heads a session attempt with its case, attempt id and outcome",
		headsASessionAttemptWithItsCaseAttemptIdAndOutcome,
	);

	describe("a pipeline stage history", pipelineHistoryIdentity);
});

async function keepsFullProvenanceAndStartingContextListsInCountedDisclosures(): Promise<void> {
	renderPage();
	await screen.findByRole("region", { name: "Context investigation" });

	const provenance = screen
		.getByText("Record provenance · 4 fields")
		.closest("details");
	const starting = screen
		.getByText("Starting context · 0 events · known boundary")
		.closest("details");
	expect(provenance).not.toHaveAttribute("open");
	expect(starting).not.toHaveAttribute("open");
	expect(screen.getByRole("group", { name: "Evidence view" })).toBeVisible();
	expect(
		screen.getByRole("region", { name: "Selected scope readings" }),
	).toBeVisible();
}

async function headsASessionAttemptWithItsCaseAttemptIdAndOutcome(): Promise<void> {
	renderPage();

	const header = await screen.findByRole("banner");

	expect(within(header).getByText("Attempt")).toBeInTheDocument();
	expect(within(header).getByText("attempt-a")).toBeInTheDocument();
	expect(within(header).getByText("Outcome")).toBeInTheDocument();
	expect(within(header).getByText("SUCCESSFUL")).toBeInTheDocument();
	expect(within(header).queryByText("Stage")).not.toBeInTheDocument();
}

function pipelineHistoryIdentity(): void {
	beforeEach(opensPipelineHistory);
	it("names the run, stage and lineage", showsPipelineHistoryIdentity);
	it(
		"omits standalone attempt and outcome labels",
		omitsStandaloneHistoryIdentity,
	);
}
async function opensPipelineHistory(): Promise<void> {
	stubFetchByPath(
		new Map([
			[
				"/api/attempts/session/case-a/attempt-a/history",
				{
					attempt: {
						caseId: "case-a",
						corpusFiles: [],
						kind: "stage",
						lineage: "lineage-1",
						model: "sonnet",
						run: "2026-09-06T21-58-29.508Z",
						stage: "shape",
						upstream: "upstream-1",
					},
					attemptEvents: [],
					boundary: "known",
					boundaryUnknown: [],
					evidence: { state: "complete" },
					schemaVersion: 1,
					sources: [],
					startingContext: [],
					startingSources: [],
				},
			],
		]),
	);
	renderStandalonePage();
	await screen.findByRole("banner");
}
async function showsPipelineHistoryIdentity(): Promise<void> {
	const header = await screen.findByRole("banner");
	expect(within(header).getByText("Run")).toBeInTheDocument();
	expect(
		within(header).getByText("2026-09-06T21-58-29.508Z"),
	).toBeInTheDocument();
	expect(within(header).getByText("Stage")).toBeInTheDocument();
	expect(within(header).getByText("shape")).toBeInTheDocument();
	expect(within(header).getByText("Lineage")).toBeInTheDocument();
	expect(within(header).getByText("lineage-1")).toBeInTheDocument();
}
async function omitsStandaloneHistoryIdentity(): Promise<void> {
	const header = await screen.findByRole("banner");
	expect(within(header).queryByText("Attempt")).not.toBeInTheDocument();
	expect(within(header).queryByText("Outcome")).not.toBeInTheDocument();
}
