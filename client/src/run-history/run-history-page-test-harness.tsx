import { afterEach } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	RouterProvider,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	useLocation,
} from "@tanstack/react-router";
import type { RenderResult } from "@testing-library/react";
import { render } from "@testing-library/react";

import stringifyRouteSearch from "#client/route-search";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer, stubFetch } from "#client/test-support/fetch-stub";

import { runDiscoverySearchSchema } from "./run-discovery";
import RunHistoryPage from "./run-history-page";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const HELD_RESPONSE_START_INDEX = 0;

interface HeldResponses {
	readonly release: () => void;
	readonly reached: Promise<undefined>;
}

const releaseHeldResponses: (() => void)[] = [];

const originalFetch = globalThis.fetch;

function serveRunHistory(
	body: RunHistoryResponseBody,
	replies: ReadonlyMap<string, Reply> = new Map(),
): FakeServer {
	const server = new FakeServer(
		new Map([["GET /api/run-listing", { body, status: 200 }], ...replies]),
	);
	server.install();

	return server;
}

function holdResponses(when: (request: Request) => boolean): HeldResponses {
	const release = Promise.withResolvers<undefined>();
	const reached = Promise.withResolvers<undefined>();
	const answer = globalThis.fetch;
	const stub = Object.assign(
		async (
			input: string | URL | Request,
			init?: RequestInit,
		): Promise<Response> => {
			const request = new Request(
				input instanceof Request ? input : new URL(input, "http://localhost"),
				init,
			);
			if (when(request)) {
				reached.resolve();
				await release.promise;
			}

			return await answer(input, init);
		},
		{ preconnect: fetch.preconnect },
	);
	globalThis.fetch = stub;
	const finish = (): void => {
		release.resolve();
	};
	releaseHeldResponses.push(finish);

	return { reached: reached.promise, release: finish };
}

function AllRecords(): React.JSX.Element {
	const search = useLocation({
		select: (location) => runDiscoverySearchSchema.parse(location.search),
	});
	return (
		<RunHistoryPage
			invalidatedBy={undefined}
			discovery={runDiscoverySearchSchema.parse(search)}
		/>
	);
}

function respondingWith(body: RunHistoryResponseBody): void {
	stubFetch(body);
}

function renderPage(): RenderResult {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});

	const root = createRootRoute({ component: AllRecords });
	const router = createRouter({
		history: createMemoryHistory({ initialEntries: ["/"] }),
		routeTree: root.addChildren([
			createRoute({ getParentRoute: () => root, path: "/cases" }),
		]),
		stringifySearch: stringifyRouteSearch,
	});

	return render(
		<QueryClientProvider client={client}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
}

function registerRunHistoryTestCleanup(): void {
	afterEach(() => {
		for (const release of releaseHeldResponses.splice(
			HELD_RESPONSE_START_INDEX,
		)) {
			release();
		}

		globalThis.fetch = originalFetch;
	});
}

function serveHistorySequence(bodies: readonly RunHistoryResponseBody[]): void {
	const replies = [...bodies];
	const stub = async (request: string | URL | Request): Promise<Response> => {
		const { pathname } = new URL(
			request instanceof Request ? request.url : request,
			"http://localhost",
		);
		if (pathname === "/api/confirmation-archives") {
			const archived = await Promise.resolve(
				Response.json({ archived: [], unreadable: [] }),
			);

			return archived;
		}
		return await Promise.resolve(
			Response.json(
				pathname === "/api/run-staleness" ? { records: {} } : replies.shift(),
			),
		);
	};
	stub.preconnect = fetch.preconnect;
	globalThis.fetch = stub;
}

export {
	serveHistorySequence,
	serveRunHistory,
	holdResponses,
	respondingWith,
	renderPage,
	registerRunHistoryTestCleanup,
};
