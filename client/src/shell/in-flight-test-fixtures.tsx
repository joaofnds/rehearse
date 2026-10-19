import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	RouterContextProvider,
	createMemoryHistory,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";

import { LaunchDialog } from "#client/launch/launch-dialog";
import createAppRouter from "#client/router";
import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import type { RunHistoryResponse } from "#client/run-history/run-history-page-named-history-builder";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import LiveReply from "#client/test-support/live-reply";
import { settingsReading } from "#client/test-support/render-app";

import { RunInFlight, RunInFlightBar } from "./run-in-flight-bar";

const EMPTY_COLLECTION_LENGTH = 0;

const refusedStopResponse = async (): Promise<Response> =>
	await Promise.resolve(
		Response.json({ error: "launch already ended" }, { status: 409 }),
	);

const acceptedStopResponse = async (): Promise<Response> =>
	await Promise.resolve(Response.json({}));

type HistoryRow = RunHistoryResponse["rows"][number];

const OLDER = "2026-09-30T09-00-00.000Z";

const NEWER = "2026-09-30T11-00-00.000Z";

const originalFetch = globalThis.fetch;

interface RenderedRunInFlight {
	readonly rerender: (next: readonly HistoryRow[]) => void;
}

function renderRunInFlight(rows: readonly HistoryRow[]): RenderedRunInFlight {
	const client = new QueryClient();
	const router = createAppRouter({
		history: createMemoryHistory({ initialEntries: ["/corpus"] }),
	});
	const view = (next: readonly HistoryRow[]): React.JSX.Element => (
		<QueryClientProvider client={client}>
			<RouterContextProvider router={router}>
				<RunInFlight rows={next} />
			</RouterContextProvider>
		</QueryClientProvider>
	);
	const { rerender } = render(view(rows));

	return {
		rerender: (next) => {
			rerender(view(next));
		},
	};
}

const IN_FLIGHT = /^Run \S+ in flight$/u;

/**
 * The bar beside a launch dialog, both reading one query cache, as every
 * screen holds them.
 */
function renderBarWithLaunch(): void {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const router = createAppRouter({
		history: createMemoryHistory({ initialEntries: ["/corpus"] }),
	});

	render(
		<QueryClientProvider client={client}>
			<RouterContextProvider router={router}>
				<LaunchDialog target={{ kind: "case" }} triggerLabel="New run" />
				<RunInFlightBar />
			</RouterContextProvider>
		</QueryClientProvider>,
	);
}

/**
 * Serves the listing the bar reads, changed by whatever `routes` answers to a
 * write.
 */
function servingListing(
	listing: () => readonly HistoryRow[],
	routes: ReadonlyMap<string, Reply>,
): FakeServer {
	const savedCeilingUsd = 5;

	const server = new FakeServer(
		new Map<string, Reply | LiveReply>([
			[
				"GET /api/run-listing",
				new LiveReply(() => ({
					body: new NamedHistoryBuilder({ rows: listing() }).build(),
					status: 200,
				})),
			],
			[
				"GET /api/settings",
				{ body: settingsReading(savedCeilingUsd), status: 200 },
			],
			[
				"GET /api/cases",
				{
					body: {
						cases: [
							{
								id: "audit-log",
								kind: "pipeline",
								model: "sonnet",
								title: "Audit log",
							},
						],
						unreadable: [],
					},
					status: 200,
				},
			],
			...routes,
		]),
	);
	server.install();

	return server;
}

function bar(): HTMLElement {
	return screen.getByRole("region", { name: IN_FLIGHT });
}

export {
	EMPTY_COLLECTION_LENGTH,
	IN_FLIGHT,
	NEWER,
	OLDER,
	acceptedStopResponse,
	bar,
	originalFetch,
	refusedStopResponse,
	renderBarWithLaunch,
	renderRunInFlight,
	servingListing,
};
