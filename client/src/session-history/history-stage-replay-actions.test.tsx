import { afterEach, describe, expect, it, jest } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { stubFetchByPath } from "#client/test-support/fetch-stub";

import {
	originalFetch,
	renderStandalonePage,
} from "./history-page-test-fixtures";
import { SessionHistoryPage } from "./session-history-page";

afterEach(() => {
	jest.useRealTimers();
	globalThis.fetch = originalFetch;
});
describe(SessionHistoryPage.name, () => {
	it(
		"opens the replay dialog for this run's stage from Replay from here",
		opensTheReplayDialogForThisRunSStageFromReplayFromHere,
	);

	it(
		"offers no replay on a page that is not a stage",
		offersNoReplayOnAPageThatIsNotAStage,
	);
});

async function opensTheReplayDialogForThisRunSStageFromReplayFromHere(): Promise<void> {
	stubFetchByPath(new Map());
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

	fireEvent.click(
		await screen.findByRole("button", { name: "Replay from here" }),
	);

	const dialog = await screen.findByRole("dialog", {
		name: "Replay shape from checkpoint",
	});
	expect(within(dialog).getByText("run-1")).toBeInTheDocument();
}

function offersNoReplayOnAPageThatIsNotAStage(): void {
	renderStandalonePage();

	expect(
		screen.queryByRole("button", { name: "Replay from here" }),
	).not.toBeInTheDocument();
}
