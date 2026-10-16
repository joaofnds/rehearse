import { afterEach, expect, it } from "bun:test";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReplayRow } from "#server/run-history";
import { renderWithRouter } from "#client/test-support/render-app";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { recordStage, runRecord } from "#client/test-support/run-record";
import {
	UNREAD_REPLAY_FIGURES,
	UNREAD_STALENESS,
} from "#client/test-support/run-figures";
import { ReplaySourceComparison } from "./replay-source-comparison";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
it("compares the actual source and replay outputs with their own grade, cost and corpus", async () => {
	const row: ReplayRow = {
		kind: "replay",
		recordId: "attempt:stage:lineage/time",
		lineage: "lineage",
		timestamp: "time",
		caseId: "case",
		stage: "build",
		grade: "B",
		status: "CONTINUE",
		shortId: "r1",
		checkpointShortId: "c1",
		attempt: { position: 2, count: 2 },
		links: [],
		corpusVersion: { kind: "version", digest: "b".repeat(64) },
		staleness: UNREAD_STALENESS,
		...UNREAD_REPLAY_FIGURES,
		cost: {
			state: "available",
			usd: 2,
			parts: [
				{ part: "build session", usd: 1.5 },
				{ part: "Product Owner", usd: 0.1 },
				{ part: "build judge", usd: 0.4 },
			],
			missing: [],
		},
	};
	stubFetchByPath(
		new Map<string, unknown>([
			[
				"/api/runs/source",
				runRecord({
					run: "source",
					running: "build",
					stages: [
						recordStage("build", {
							grade: {
								state: "available",
								letter: "C",
								verdict: "STOP",
								reachesMinimum: false,
							},
							sessionCost: { state: "available", usd: 3 },
							judgeCost: { state: "available", usd: 0.5 },
							corpusVersion: { kind: "version", digest: "a".repeat(64) },
						}),
					],
				}),
			],
			[
				"/api/runs/source/stages/build/output",
				{
					state: "available",
					kind: "artifact",
					path: "delivery.md",
					text: "Original delivery omitted hasMore.",
				},
			],
			[
				"/api/attempt-evidence/attempt%3Astage%3Alineage%2Ftime",
				{
					state: "available",
					kind: "stage",
					stage: "build",
					output: {
						state: "available",
						kind: "artifact",
						path: "delivery.md",
						text: "Replay delivery includes hasMore.",
					},
					assessment: {
						grade: "B",
						verdict: "CONTINUE",
						detailed: false,
						hardBlockers: [],
						requirements: [],
						dimensions: [],
					},
				},
			],
		]),
	);
	renderWithRouter(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<ReplaySourceComparison sourceRun="source" row={row} />
		</QueryClientProvider>,
	);
	await act(() => {
		fireEvent.click(
			screen.getByRole("button", { name: "Compare with source" }),
		);
		return Promise.resolve();
	});
	const dialog = await screen.findByRole("dialog");
	expect(
		await within(dialog).findByText("Original delivery omitted hasMore."),
	).toBeInTheDocument();
	expect(
		await within(dialog).findByText("Replay delivery includes hasMore."),
	).toBeInTheDocument();
	expect(
		within(dialog).getByText("Grade C · Worker + Judge $3.50 · corpus@aaaaaa"),
	).toBeInTheDocument();
	expect(
		within(dialog).getByText("Grade B · Replay total $2.00 · corpus@bbbbbb"),
	).toBeInTheDocument();
	expect(
		within(dialog).getByText(/no control or repeated sample/u),
	).toBeInTheDocument();
	expect(
		within(dialog).getByRole("link", { name: "Source step" }),
	).toHaveAttribute("href", "/runs/source?view=results&step=build");
});
