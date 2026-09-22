import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import type { CorpusResponse } from "#client/corpus/corpus-query";
import { createAppRouter } from "#client/router";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { stubFetchByPath } from "./fetch-stub";

const NO_RUNS: RunHistoryResponse = { rows: [], unreadable: [] };

const EMPTY_CORPUS: CorpusResponse = {
	root: "/corpus",
	digest: "ffd58d",
	files: [],
	refusals: [],
};

export function renderAppAt(path: string): void {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const router = createAppRouter({
		history: createMemoryHistory({ initialEntries: [path] }),
	});

	render(
		<QueryClientProvider client={client}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
}

/**
 * The shell queries run history and the corpus on every route for its nav
 * badges and corpus card, so every route test serves those two alongside
 * whatever its own screen reads.
 */
export function renderAppWithStub(
	path: string,
	byPath: ReadonlyMap<string, unknown>,
): void {
	stubFetchByPath(
		new Map<string, unknown>([
			["/api/runs", NO_RUNS],
			["/api/corpus", EMPTY_CORPUS],
			...byPath,
		]),
	);
	renderAppAt(path);
}
