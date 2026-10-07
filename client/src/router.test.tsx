import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { SessionHistoryReport } from "#benchmark/session-history";
import type { SessionHistoryAttemptSeries } from "#server/session-history-reader";
import { renderAppWithStub } from "#client/test-support/render-app";
import {
	UNREAD_RUN_FIGURES,
	unversionedStaleness,
} from "#client/test-support/run-figures";
import { createAppRouter } from "./router";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

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
		renderAppWithStub(
			"/",
			new Map<string, unknown>([
				["/api/runs", { rows: [], launches: [], unreadable: [] }],
			]),
		);

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Run history" }),
			).toBeInTheDocument();
		});
	});

	it("renders the design system reference at /system", async () => {
		renderAppWithStub("/system", new Map<string, unknown>());

		await waitFor(() => {
			expect(screen.getByText("Rehearse design system")).toBeInTheDocument();
		});
	});

	it("renders the corpus screen at /corpus", async () => {
		renderAppWithStub(
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
		renderAppWithStub(
			`/comparisons/${digest}`,
			new Map([
				[
					`/api/comparisons/${digest}`,
					{
						report: { mode: "session", cases: [] },
						checkpoint: { state: "unavailable", reasons: ["no checkpoint"] },
						corpusVersions: {},
						armFigures: {},
						attribution: {},
						summary: {},
						baselineArm: { kind: "supplied" },
					},
				],
			]),
		);

		expect(
			await screen.findByRole("heading", {
				level: 1,
				name: /^Comparison · session/u,
			}),
		).toBeInTheDocument();
	});

	it("renders standalone saved session history", async () => {
		renderAppWithStub(
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

	it("renders a saved pipeline stage's context history", async () => {
		renderAppWithStub(
			"/runs/2026-09-06T21-58-29.508Z/stages/shape",
			new Map<string, unknown>([
				[
					"/api/runs/2026-09-06T21-58-29.508Z/stages/shape/history",
					{
						...emptyHistory("case-a", "unused"),
						attempt: {
							kind: "stage",
							caseId: "case-a",
							run: "2026-09-06T21-58-29.508Z",
							stage: "shape",
							lineage: "lineage-1",
							upstream: "upstream-1",
							model: "sonnet",
							corpusFiles: [],
						},
					},
				],
			]),
		);

		await waitFor(() => {
			expect(screen.getByText("2026-09-06T21-58-29.508Z")).toBeInTheDocument();
			expect(screen.getByText("shape")).toBeInTheDocument();
			expect(screen.getByText("lineage-1")).toBeInTheDocument();
		});
	});

	it("renders a stage replay's saved history from the replay it names, asking for nothing it does not serve", async () => {
		renderAppWithStub(
			"/replays/60758c/2026-09-06T22-33-15.057Z",
			new Map<string, unknown>([
				[
					"/api/replays/60758c/2026-09-06T22-33-15.057Z/history",
					{
						...emptyHistory("case-a", "unused"),
						attempt: {
							kind: "stage",
							caseId: "case-a",
							run: "2026-09-06T22-33-15.057Z",
							stage: "shape",
							lineage: "60758c",
							upstream: "upstream-1",
							model: "sonnet",
							corpusFiles: [],
						},
						attemptEvents: [
							{
								id: "1:1",
								locator: { line: 1, block: 1 },
								region: "attempt",
								kind: "call",
								state: "invoked",
								label: "Read CLAUDE.md",
								timestamp: "2026-09-06T22:33:16.000Z",
								toolUseId: "read-1",
								toolName: "Read",
								sourceId: "project:/work/CLAUDE.md",
								measurement: {
									state: "unavailable",
									reasons: ["not delivered"],
								},
								relatedEventIds: [],
							},
						],
					},
				],
			]),
		);

		await waitFor(() => {
			expect(screen.getByText("60758c")).toBeInTheDocument();
			expect(
				screen.getByText("A replay serves no per-event evidence detail."),
			).toBeInTheDocument();
		});
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("opens the stage a stopped run stopped on from its run history row", async () => {
		renderAppWithStub(
			"/",
			new Map<string, unknown>([
				[
					"/api/runs",
					{
						rows: [
							{
								kind: "run",
								...UNREAD_RUN_FIGURES,
								links: [],
								run: "2026-09-06T21-58-29.508Z",
								caseId: "audit-log",
								status: "STOPPED:build",
								stage: "shape",
								grade: "B",
								corpusVersion: { kind: "version", digest: "a3a62f" },
								corpusChangedDuringRun: false,
								staleness: unversionedStaleness({ stale: false, causes: [] }),
								progress: { state: "recorded" },
							},
						],
						launches: [],
						unreadable: [],
					},
				],
			]),
		);
		const link = await screen.findByRole("link", { name: /^build/u });
		const href = link.getAttribute("href") ?? "";
		cleanup();

		renderAppWithStub(
			href,
			new Map<string, unknown>([
				["/api/runs/2026-09-06T21-58-29.508Z/stages/build/history/corpus", []],
				[
					"/api/runs/2026-09-06T21-58-29.508Z/stages/build/history",
					{
						...emptyHistory("audit-log", "unused"),
						attempt: {
							kind: "stopped-stage",
							caseId: "audit-log",
							run: "2026-09-06T21-58-29.508Z",
							stage: "build",
							error: "build stage graded C; minimum grade is B",
							model: "sonnet",
							corpusFiles: [],
						},
						evidence: {
							state: "unavailable",
							reasons: ["this stage stopped before recording a transcript"],
						},
					},
				],
			]),
		);

		expect(
			await screen.findByText("build stage graded C; minimum grade is B"),
		).toBeInTheDocument();
	});

	it("opens a stage judge's evidence item at its source route", async () => {
		const run = "2026-09-27T00-00-00.000Z";
		renderAppWithStub(
			`/runs/${run}/stages/build/evidence/requirements/scope/0`,
			new Map<string, unknown>([
				[
					`/api/runs/${run}/stages/build/evidence/requirements/scope/0`,
					{
						record: `.benchmark-runs/${run}.build.json`,
						source: "diff",
						path: "src/app.ts",
						claim: "the stage claim",
						view: { kind: "absent" },
					},
				],
			]),
		);

		expect(await screen.findByText("the stage claim")).toBeInTheDocument();
	});

	it("opens a final judge's evidence item at its source route", async () => {
		const run = "2026-09-27T00-00-00.000Z";
		renderAppWithStub(
			`/runs/${run}/final/evidence/tests/1`,
			new Map<string, unknown>([
				[
					`/api/runs/${run}/final/evidence/tests/1`,
					{
						record: `.benchmark-runs/${run}.json`,
						source: "diff",
						path: "src/app.ts",
						claim: "the final claim",
						view: { kind: "before-quoted-spans" },
					},
				],
			]),
		);

		expect(await screen.findByText("the final claim")).toBeInTheDocument();
	});

	it("renders confirmation rep saved session history", async () => {
		renderAppWithStub(
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
