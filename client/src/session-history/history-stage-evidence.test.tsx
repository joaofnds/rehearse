import { afterEach, describe, expect, it, jest } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { stubFetchByPath } from "#client/test-support/fetch-stub";

import {
	originalFetch,
	renderPage,
	renderStandalonePage,
} from "./history-page-test-fixtures";
import { STAGE_CORPUS_REPLIES } from "./history-stage-test-fixtures";
import { SessionHistoryPage } from "./session-history-page";

afterEach(() => {
	jest.useRealTimers();
	globalThis.fetch = originalFetch;
});
describe(SessionHistoryPage.name, () => {
	it(
		"says a stage records no request series rather than reporting a load failure",
		saysAStageRecordsNoRequestSeriesRatherThanReportingALoadFailure,
	);

	it(
		"reconciles a stage's declared corpus against what its transcript shows",
		reconcilesAStageSDeclaredCorpusAgainstWhatItsTranscriptShows,
	);

	it(
		"names an empty historical attempt as boundary unknown",
		namesAnEmptyHistoricalAttemptAsBoundaryUnknown,
	);

	it(
		"renders saved instruction markup as visible text rather than as markup",
		rendersSavedInstructionMarkupAsVisibleTextRatherThanAsMarkup,
	);
});

async function saysAStageRecordsNoRequestSeriesRatherThanReportingALoadFailure(): Promise<void> {
	stubFetchByPath(
		new Map([
			[
				"/api/runs/run-1/stages/shape/history",
				{
					attempt: {
						caseId: "case-a",
						corpusFiles: [],
						kind: "stage",
						lineage: "lineage-1",
						model: "sonnet",
						run: "run-1",
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
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<SessionHistoryPage
				identity={{ kind: "stage", run: "run-1", stage: "shape" }}
			/>
		</QueryClientProvider>,
	);

	const timeline = await screen.findByRole("region", {
		name: "Request timeline",
	});

	expect(
		within(timeline).getByText(
			"A saved stage or replay records no request series; raw transcript history cannot be reconstructed.",
		),
	).toBeInTheDocument();
	expect(within(timeline).queryByRole("alert")).not.toBeInTheDocument();
}

async function reconcilesAStageSDeclaredCorpusAgainstWhatItsTranscriptShows(): Promise<void> {
	stubFetchByPath(STAGE_CORPUS_REPLIES);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<SessionHistoryPage
				identity={{ kind: "stage", run: "run-1", stage: "shape" }}
			/>
		</QueryClientProvider>,
	);

	const corpus = await screen.findByRole("region", {
		name: "Declared corpus",
	});

	fireEvent.click(within(corpus).getByText(/Declared corpus ·/u));
	expect(
		within(corpus)
			.getAllByRole("listitem")
			.map((item) => item.textContent),
	).toEqual([
		"CLAUDE.md Observed · 1:1",
		"skills/build/SKILL.md No observation recorded",
		"agents/reviewer.md Undeclared · 3:1",
	]);
}

async function namesAnEmptyHistoricalAttemptAsBoundaryUnknown(): Promise<void> {
	stubFetchByPath(
		new Map([
			[
				"/api/attempts/session/case-a/attempt-a/history",
				{
					attempt: {
						caseId: "case-a",
						corpusFiles: [],
						id: "attempt-a",
						kind: "session",
						model: "sonnet",
						outcome: "SUCCESSFUL",
					},
					attemptEvents: [],
					boundary: "unknown",
					boundaryUnknown: [],
					evidence: {
						reasons: ["empty transcript", "attempt boundary unavailable"],
						state: "partial",
					},
					schemaVersion: 1,
					sources: [],
					startingContext: [],
					startingSources: [],
				},
			],
		]),
	);
	renderStandalonePage();

	await screen.findByRole("heading", { name: "Saved context history" });
	expect(
		screen.getByText(/Starting context.*Boundary unknown/u),
	).toBeInTheDocument();
	expect(
		screen.getByText(/Unavailable · boundary unknown · empty transcript/u),
	).toBeInTheDocument();
	expect(
		screen.getByRole("heading", { name: "Boundary-unknown events" }),
	).toBeInTheDocument();
}

async function rendersSavedInstructionMarkupAsVisibleTextRatherThanAsMarkup(): Promise<void> {
	renderPage();
	fireEvent.click(await screen.findByRole("button", { name: "Requests" }));

	const timeline = await screen.findByRole("region", {
		name: "Request timeline",
	});

	const load = within(timeline).getByText(
		"<path>/**bold**/<script>alert(1)</script>.md",
		{ selector: "code" },
	);
	expect(load).toBeInTheDocument();
	expect(load.querySelector("script")).toBeNull();
	expect(load.querySelector("strong")).toBeNull();
	expect(load.innerHTML).toBe(
		"&lt;path&gt;/**bold**/&lt;script&gt;alert(1)&lt;/script&gt;.md",
	);
	expect(timeline).toHaveTextContent(
		/reason, trigger and include parent unavailable/u,
	);
}
