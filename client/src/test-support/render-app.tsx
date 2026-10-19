import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	RouterContextProvider,
	RouterProvider,
	createMemoryHistory,
	createRootRoute,
	createRouter,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";

import stringifyRouteSearch from "#client/route-search";
import createAppRouter from "#client/router";

import { stubFetchByPath } from "./fetch-stub";
import { SHELL_BASELINE } from "./shell-response-fixtures";

type AppRouter = ReturnType<typeof createAppRouter>;

/** Hosts a leaf component with the router its navigation links use. */
function renderWithRouter(content: Readonly<React.JSX.Element>): void {
	const root = createRootRoute();
	const router = createRouter({
		history: createMemoryHistory({ initialEntries: ["/"] }),
		routeTree: root,
		stringifySearch: stringifyRouteSearch,
	});
	render(
		<RouterContextProvider router={router}>{content}</RouterContextProvider>,
	);
}

/** Renders the app at `path`, returning its router so a test can read where it went. */
function renderAppAt(path: string): AppRouter {
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

	return router;
}

/**
 * Every route test serves the shell's baseline alongside whatever its own
 * screen reads.
 */
function renderAppWithStub(
	path: string,
	byPath: ReadonlyMap<string, unknown>,
): AppRouter {
	stubFetchByPath(
		new Map<string, unknown>([
			...SHELL_BASELINE,
			...(byPath.has("/api/runs") && !byPath.has("/api/run-listing")
				? [["/api/run-listing", byPath.get("/api/runs")] as const]
				: []),
			...byPath,
		]),
	);

	return renderAppAt(path);
}

/**
 * Answers every path but `failing` as `stubFetchByPath` answers the shell's
 * baseline, a 404 for any path outside it, and rejects that one the way an
 * unreachable server does, so a screen's error branch is observed against a
 * real rejection rather than a body that merely lacks fields.
 */
function stubFetchFailing(failing: string): void {
	stubFetchByPath(SHELL_BASELINE);
	const answer = globalThis.fetch;
	const stub = async (request: string | URL | Request): Promise<Response> => {
		const { pathname } = new URL(
			request instanceof Request ? request.url : request,
			"http://localhost",
		);
		if (pathname === failing) {
			throw new Error("connection refused");
		}

		return await answer(request);
	};
	stub.preconnect = fetch.preconnect;
	globalThis.fetch = stub;
}

export {
	NO_GRADES,
	SHELL_BASELINE,
	settingsReading,
} from "./shell-response-fixtures";
export { renderAppAt, renderAppWithStub, renderWithRouter, stubFetchFailing };
export type { AppRouter };
