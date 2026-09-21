import { afterEach, describe, expect, it } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import type { SessionHistoryReport } from "#benchmark/session-history";
import type { SessionHistoryAttemptSeries } from "#server/session-history-reader";
import { stubFetch, stubFetchByPath } from "#client/test-support/fetch-stub";
import { createAppRouter } from "./router";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function renderAt(path: string): void {
	stubFetch({ rows: [], unreadable: [] });
	renderRouterAt(path);
}

function renderAtWithStub(
	path: string,
	byPath: ReadonlyMap<string, unknown>,
): void {
	stubFetchByPath(byPath);
	renderRouterAt(path);
}

function renderRouterAt(path: string): void {
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

function emptyHistory(caseId: string, id: string): SessionHistoryReport {
	return {
		schemaVersion: 1,
		attempt: {
			kind: "session",
			caseId,
			id,
			model: "sonnet",
			outcome: "SUCCESSFUL",
			corpusFiles: [],
		},
		evidence: { state: "complete" },
		boundary: "known",
		startingContext: [],
		attemptEvents: [],
		boundaryUnknown: [],
		startingSources: [],
		sources: [],
	};
}

function emptyRequestSeries(): SessionHistoryAttemptSeries {
	return {
		series: {
			name: "total input tokens",
			measuresActiveContextWindow: false,
			omits: [],
			boundary: "known",
			transcriptState: "saved",
			entries: [],
			compactions: [],
			attemptTotals: {
				state: "complete",
				requestCount: 0,
				usage: {
					inputTokens: 0,
					outputTokens: 0,
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
				},
				totalInputTokens: 0,
			},
		},
		cost: {
			reported: { state: "complete", costUsd: 0 },
			calculated: { state: "complete", costUsd: 0 },
			difference: { state: "complete", costUsd: 0 },
		},
		requestCosts: [],
		instructionLoads: { state: "unavailable" },
	};
}

describe(createAppRouter.name, () => {
	it("renders run history at the root path, the landing screen", async () => {
		renderAt("/");

		await waitFor(() => {
			expect(screen.getByText("Run history")).toBeInTheDocument();
		});
	});

	it("renders the design system reference at /system", async () => {
		renderAt("/system");

		await waitFor(() => {
			expect(screen.getByText("Rehearse design system")).toBeInTheDocument();
		});
	});

	it("renders the corpus screen at /corpus", async () => {
		renderAtWithStub(
			"/corpus",
			new Map([
				[
					"/api/corpus",
					{ root: "/corpus", digest: "a", files: [], refusals: [] },
				],
			]),
		);

		await waitFor(() => {
			expect(screen.getByText("Instruction corpus")).toBeInTheDocument();
		});
	});

	it("renders the comparison screen at /comparisons/$digest", async () => {
		const digest = "e".repeat(64);
		renderAtWithStub(
			`/comparisons/${digest}`,
			new Map([
				[
					`/api/comparisons/${digest}`,
					{ report: { cases: [] }, attribution: {} },
				],
			]),
		);

		await waitFor(() => {
			expect(screen.getByText("Comparison")).toBeInTheDocument();
		});
	});

	it("renders standalone saved session history", async () => {
		renderAtWithStub(
			"/attempts/session/case-a/attempt-a",
			new Map<string, unknown>([
				[
					"/api/attempts/session/case-a/attempt-a/history",
					emptyHistory("case-a", "attempt-a"),
				],
				[
					"/api/attempts/session/case-a/attempt-a/history/requests",
					emptyRequestSeries(),
				],
			]),
		);

		await waitFor(() => {
			expect(screen.getByText("case-a")).toBeInTheDocument();
			expect(screen.getByText("attempt-a")).toBeInTheDocument();
		});
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("renders confirmation rep saved session history", async () => {
		renderAtWithStub(
			"/groups/group-a/reps/group-a-rep-1/attempt",
			new Map<string, unknown>([
				[
					"/api/groups/group-a/reps/group-a-rep-1/attempt/history",
					emptyHistory("case-a", "group-a-rep-1"),
				],
				[
					"/api/groups/group-a/reps/group-a-rep-1/attempt/history/requests",
					emptyRequestSeries(),
				],
			]),
		);

		await waitFor(() => {
			expect(screen.getByText("case-a")).toBeInTheDocument();
			expect(screen.getByText("group-a-rep-1")).toBeInTheDocument();
		});
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});
