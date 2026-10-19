import { afterEach, describe, expect, it, jest } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { stubFetchByPath } from "#client/test-support/fetch-stub";

import { originalFetch } from "./history-page-test-fixtures";
import {
	AWAITING_JUDGE_REPLIES,
	STOPPED_STAGE_REPLIES,
} from "./history-stage-test-fixtures";
import { SessionHistoryPage } from "./session-history-page";

afterEach(() => {
	jest.useRealTimers();
	globalThis.fetch = originalFetch;
});
describe(SessionHistoryPage.name, () => {
	it(
		"names a stopped stage's reason instead of reporting a load failure",
		namesAStoppedStageSReasonInsteadOfReportingALoadFailure,
	);

	it(
		"names a stage whose judging never completed instead of reporting a load failure",
		namesAStageWhoseJudgingNeverCompletedInsteadOfReportingALoadFailure,
	);

	it(
		"reports a stage whose page genuinely failed to load as a failure",
		reportsAStageWhosePageGenuinelyFailedToLoadAsAFailure,
	);
});

async function namesAStoppedStageSReasonInsteadOfReportingALoadFailure(): Promise<void> {
	stubFetchByPath(STOPPED_STAGE_REPLIES);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<SessionHistoryPage
				identity={{ kind: "stage", run: "run-1", stage: "build" }}
			/>
		</QueryClientProvider>,
	);

	const heading = await screen.findByRole("banner");

	expect(heading).toHaveTextContent(
		/Stopped because.*build stage graded C; minimum grade is B/u,
	);
	expect(heading).not.toHaveTextContent(/Lineage/u);
	expect(
		screen.queryByText("Could not load saved history."),
	).not.toBeInTheDocument();

	const corpus = await screen.findByRole("region", {
		name: "Declared corpus",
	});

	fireEvent.click(within(corpus).getByText(/Declared corpus ·/u));
	expect(
		within(corpus)
			.getAllByRole("listitem")
			.map((item) => item.textContent),
	).toEqual(["CLAUDE.md No observation recorded"]);
}

async function namesAStageWhoseJudgingNeverCompletedInsteadOfReportingALoadFailure(): Promise<void> {
	stubFetchByPath(AWAITING_JUDGE_REPLIES);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<SessionHistoryPage
				identity={{ kind: "stage", run: "run-1", stage: "build" }}
			/>
		</QueryClientProvider>,
	);

	const heading = await screen.findByRole("banner");

	expect(heading).toHaveTextContent(/Run.*run-1/u);
	expect(heading).toHaveTextContent(/Stage.*build/u);
	expect(heading).not.toHaveTextContent(/Lineage/u);
	expect(heading).not.toHaveTextContent(/Stopped because/u);
	expect(
		screen.queryByText("Could not load saved history."),
	).not.toBeInTheDocument();
	expect(
		await screen.findByText(
			/its judging never completed, so no transcript was recorded/u,
		),
	).toBeInTheDocument();
}

async function reportsAStageWhosePageGenuinelyFailedToLoadAsAFailure(): Promise<void> {
	stubFetchByPath(new Map<string, unknown>());
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<SessionHistoryPage
				identity={{ kind: "stage", run: "run-1", stage: "nonexistent" }}
			/>
		</QueryClientProvider>,
	);

	const alert = await screen.findByRole("alert");

	expect(alert).toHaveTextContent("Could not load saved history.");
}
