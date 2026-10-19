import { afterEach, expect, it } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, within } from "@testing-library/react";

import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { renderWithRouter } from "#client/test-support/render-app";
import {
	REPLAY_SOURCE_REPLIES,
	REPLAY_SOURCE_ROW,
} from "#client/test-support/session-history/replay-source-test-fixtures";

import ReplaySourceComparison from "./replay-source-comparison";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
it(
	"compares the actual source and replay outputs with their own grade, cost and corpus",
	comparesTheActualSourceAndReplayOutputsWithTheirOwnGradeCostAndCorpus,
);

async function comparesTheActualSourceAndReplayOutputsWithTheirOwnGradeCostAndCorpus(): Promise<void> {
	stubFetchByPath(REPLAY_SOURCE_REPLIES);
	renderWithRouter(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<ReplaySourceComparison sourceRun="source" row={REPLAY_SOURCE_ROW} />
		</QueryClientProvider>,
	);
	await act(async () => {
		fireEvent.click(
			screen.getByRole("button", { name: "Compare with source" }),
		);
		await Promise.resolve();
	});
	const dialog = await screen.findByRole("dialog");
	expect(
		await within(dialog).findByText("Original delivery omitted hasMore."),
	).toBeInTheDocument();
	expect(
		await within(dialog).findByText("Replay delivery includes hasMore."),
	).toBeInTheDocument();
	expect(
		within(dialog).getByText("Grade C · Worker + Judge $3.50 · corpus@aaaaaa"),
	).toBeInTheDocument();
	expect(
		within(dialog).getByText("Grade B · Replay total $2.00 · corpus@bbbbbb"),
	).toBeInTheDocument();
	expect(
		within(dialog).getByText(/no control or repeated sample/u),
	).toBeInTheDocument();
	expect(
		within(dialog).getByRole("link", { name: "Source step" }),
	).toHaveAttribute("href", "/runs/source?view=results&step=build");
}
