import { afterEach, describe, expect, it } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";

import { stubFetchByPath } from "#client/test-support/fetch-stub";
import {
	renderAppWithStub,
	renderWithRouter,
} from "#client/test-support/render-app";

import CorpusPage from "./corpus-page";
import type { CorpusResponse } from "./corpus-test-fixtures";
import {
	LIVE_SETTINGS,
	corpusResponseBody,
	originalFetch,
	renderPage,
} from "./corpus-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(CorpusPage.name, () => {
	it("renders the corpus root unredacted", rendersTheCorpusRootUnredacted);

	it(
		"labels the current version 'corpus@' over its first six characters, as run history does",
		labelsTheCurrentVersionCorpusOverItsFirstSixCharactersAsRunHistoryDoes,
	);

	it(
		"renders one row per file with its path, hash, last-edited time, and read-by count",
		rendersOneRowPerFileWithItsPathHashLastEditedTimeAndReadByCount,
	);

	describe("when the last edit is not recorded", () => {
		it(
			"shows the server's reason on the card and reads no file as 0 results",
			showsTheServerSReasonOnTheCardAndReadsNoFileAs0Results,
		);
	});

	it(
		"renders the empty state instead of a table when the corpus tree holds no files",
		rendersTheEmptyStateInsteadOfATableWhenTheCorpusTreeHoldsNoFiles,
	);
});

async function rendersTheCorpusRootUnredacted(): Promise<void> {
	renderPage();

	await waitFor(() => {
		expect(screen.getByText("/home/user/.claude")).toBeInTheDocument();
	});
}

async function labelsTheCurrentVersionCorpusOverItsFirstSixCharactersAsRunHistoryDoes(): Promise<void> {
	renderPage();

	await waitFor(() => {
		expect(screen.getByText("corpus@a41c7e")).toBeInTheDocument();
	});
	expect(screen.queryByText(/corpus root@/u)).toBeNull();
}

async function rendersOneRowPerFileWithItsPathHashLastEditedTimeAndReadByCount(): Promise<void> {
	renderPage();

	await waitFor(() => {
		expect(screen.getByText("CLAUDE.md")).toBeInTheDocument();
	});
	expect(screen.getByText("23")).toBeInTheDocument();
}

async function showsTheServerSReasonOnTheCardAndReadsNoFileAs0Results(): Promise<void> {
	renderAppWithStub(
		"/corpus",
		new Map<string, unknown>([
			["/api/corpus", corpusResponseBody()],
			["/api/settings", LIVE_SETTINGS],
		]),
	);

	const card = await screen.findByRole("region", {
		name: "Invalidated by the last edit",
	});

	expect(card).toHaveTextContent(
		"Not recorded: the corpus under test has no earlier version in its log to compare against",
	);
	expect(
		screen.getByRole("columnheader", { name: "Prior-version results" }),
	).toBeInTheDocument();
	expect(screen.queryByText(/0 results/u)).toBeNull();
}

async function rendersTheEmptyStateInsteadOfATableWhenTheCorpusTreeHoldsNoFiles(): Promise<void> {
	const empty: CorpusResponse = {
		...corpusResponseBody(),
		digest: "e3b0c4",
		files: [],
	};
	stubFetchByPath(new Map([["/api/corpus", empty]]));
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	renderWithRouter(
		<QueryClientProvider client={client}>
			<CorpusPage />
		</QueryClientProvider>,
	);

	await waitFor(() => {
		expect(screen.getByText("No corpus files found")).toBeInTheDocument();
	});
	expect(screen.queryByRole("table")).not.toBeInTheDocument();
}
