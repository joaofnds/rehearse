import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { createAppRouter } from "#client/router";
import { stubFetchByPath } from "./fetch-stub";

/**
 * Renders the whole app, shell included, at an address, the way a browser
 * opening that address would.
 */
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
			["/api/runs", { rows: [], unreadable: [] }],
			[
				"/api/corpus",
				{ root: "/corpus", digest: "ffd58d", files: [], refusals: [] },
			],
			...byPath,
		]),
	);
	renderAppAt(path);
}
