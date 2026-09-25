import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import type { ComparisonIndexResponse } from "#client/comparison/comparison-index-query";
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
	lastEdit: {
		kind: "not-recorded",
		reason:
			"the corpus under test has no earlier version in its log to compare against",
	},
};

const NO_COMPARISONS: ComparisonIndexResponse = {
	comparisons: [],
	unreadable: [],
};

/**
 * The bodies the shell reads on every route, for its nav badges and corpus
 * card, each typed against its own route's response.
 */
export const SHELL_BASELINE: ReadonlyMap<string, unknown> = new Map<
	string,
	unknown
>([
	["/api/runs", NO_RUNS],
	["/api/corpus", EMPTY_CORPUS],
	["/api/comparisons", NO_COMPARISONS],
]);

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
 * Every route test serves the shell's baseline alongside whatever its own
 * screen reads.
 */
export function renderAppWithStub(
	path: string,
	byPath: ReadonlyMap<string, unknown>,
): void {
	stubFetchByPath(new Map<string, unknown>([...SHELL_BASELINE, ...byPath]));
	renderAppAt(path);
}

/**
 * Answers every path but `failing` as `stubFetchByPath` answers the shell's
 * baseline, a 404 for any path outside it, and rejects that one the way an
 * unreachable server does, so a screen's error branch is observed against a
 * real rejection rather than a body that merely lacks fields.
 */
export function stubFetchFailing(failing: string): void {
	stubFetchByPath(SHELL_BASELINE);
	const answer = globalThis.fetch;
	const stub = (request: string | URL | Request): Promise<Response> => {
		const { pathname } = new URL(
			request instanceof Request ? request.url : request,
			"http://localhost",
		);
		if (pathname === failing) {
			return Promise.reject(new Error("connection refused"));
		}

		return answer(request);
	};
	stub.preconnect = fetch.preconnect;
	globalThis.fetch = stub;
}
