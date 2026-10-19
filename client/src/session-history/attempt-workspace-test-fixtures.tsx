import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Immutable } from "#benchmark/contracts";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { renderWithRouter } from "#client/test-support/render-app";
import type { ReplayRow } from "#server/run-history";

import AttemptWorkspacePage from "./attempt-workspace";
import type { SessionHistoryIdentity } from "./session-history-page";

const originalFetch = globalThis.fetch;

function show(
	identity: SessionHistoryIdentity,
	view: "results" | "context",
	routes: ReadonlyMap<string, unknown>,
): void {
	stubFetchByPath(routes);
	renderWithRouter(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<AttemptWorkspacePage identity={identity} view={view} />
		</QueryClientProvider>,
	);
}

function replayEvidenceRoutes(
	row: Immutable<ReplayRow>,
): ReadonlyMap<string, unknown> {
	return new Map([
		["/api/runs", { launches: [], rows: [row], unreadable: [] }],
		[
			"/api/replays/lineage-a/2026-10-01T12%3A00%3A00Z/history",
			{
				attempt: { kind: "stage", run: "source-run", stage: "build" },
				attemptEvents: [],
				boundary: "known",
				boundaryUnknown: [],
				evidence: {
					reasons: ["replay retains none"],
					state: "unavailable",
				},
				schemaVersion: 1,
				sources: [],
				startingContext: [],
				startingSources: [],
			},
		],
	]);
}

export { originalFetch, replayEvidenceRoutes, show };
