import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import type { SessionHistoryReport } from "#benchmark/session-history";
import type { SessionHistoryAttemptSeries } from "#server/session-history-reader";
import { renderAppWithStub } from "#client/test-support/render-app";
import type { CorpusResponse } from "#client/corpus/corpus-query";
import { createAppRouter } from "./router";
import {
	RUN,
	history,
	renderRunDetail,
	stoppedRow,
} from "#client/test-support/run-detail";

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
	it("opens the aggregate group workspace at a saved group address", async () => {
		renderAppWithStub(
			"/groups/missing-group",
			new Map([["/api/runs", { rows: [], launches: [], unreadable: [] }]]),
		);
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"No saved group missing-group was found.",
		);
	});

	it("opens Judge calibration within Settings", async () => {
		renderAppWithStub(
			"/settings?view=judges",
			new Map([
				[
					"/api/calibration",
					{
						reviews: 0,
						withinOneStep: 0,
						ungraded: 0,
						next: null,
						rows: [],
						groups: [],
					},
				],
			]),
		);
		expect(
			await screen.findByRole("heading", { name: "Settings" }),
		).toBeInTheDocument();
		expect(
			await screen.findByRole("heading", { name: "Judge calibration" }),
		).toBeInTheDocument();
	});

	it("renders run history at the root path, the landing screen", async () => {
		renderAppWithStub(
			"/",
			new Map<string, unknown>([
				["/api/runs", { rows: [], launches: [], unreadable: [] }],
			]),
		);

		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "Runs" })).toBeInTheDocument();
		});
	});

	it("renders the corpus screen at /corpus", async () => {
		renderAppWithStub(
			"/corpus",
			new Map([
				[
					"/api/corpus",
					{
						root: "/corpus",
						digest: "a",
						files: [],
						refusals: [],
						lastEdit: { kind: "not-recorded", reason: "no earlier version" },
					} satisfies CorpusResponse,
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
			"/attempts/session/case-a/attempt-a?view=context",
			new Map<string, unknown>([
				[
					"/api/attempts/session/case-a/attempt-a/history",
					emptyHistory("case-a", "attempt-a"),
				],
				[
					"/api/attempts/session/case-a/attempt-a/history/requests",
					emptyRequestSeries(),
				],
				[
					"/api/attempts/session/case-a/attempt-a/history/agents",
					{
						state: "unavailable",
						reason: "the attempt has no saved transcript",
					},
				],
			]),
		);

		await waitFor(() => {
			expect(screen.getByText("case-a")).toBeInTheDocument();
			expect(screen.getByText("attempt-a")).toBeInTheDocument();
		});
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("opens a saved session attempt on Results with its Context available", async () => {
		renderAppWithStub(
			"/attempts/session/case-a/attempt-a",
			new Map([["/api/runs", { rows: [], launches: [], unreadable: [] }]]),
		);

		const views = await screen.findByRole("navigation", {
			name: "Attempt views",
		});
		expect(
			within(views).getByRole("link", { name: "Results" }),
		).toHaveAttribute("aria-current", "page");
		expect(
			within(views).getByRole("link", { name: "Context & cost" }),
		).toHaveAttribute(
			"href",
			"/attempts/session/case-a/attempt-a?view=context",
		);
		expect(
			await screen.findByText(
				"This saved attempt has no readable result in Runs.",
			),
		).toBeInTheDocument();
	});

	it("renders a saved pipeline stage's context history", async () => {
		renderRunDetail(
			new Map<string, unknown>([
				[
					`/api/runs/${RUN}/stages/shape/history`,
					{
						...emptyHistory("case-a", "unused"),
						attempt: {
							kind: "stage",
							caseId: "case-a",
							run: RUN,
							stage: "shape",
							lineage: "lineage-1",
							upstream: "upstream-1",
							model: "sonnet",
							corpusFiles: [],
						},
					},
				],
			]),
			[],
			`/runs/${RUN}/stages/shape`,
		);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Context & cost" }),
			).toHaveAttribute("aria-pressed", "true");
			const graph = screen.getByRole("region", { name: "Task graph" });
			const [selected] = within(graph).getAllByRole("button");
			expect(selected).toHaveTextContent("shape");
			expect(selected).toHaveAttribute("aria-current", "step");
			expect(screen.getByText("lineage-1")).toBeInTheDocument();
		});
	});

	it("renders a stage replay's saved history from the replay it names, asking for nothing it does not serve", async () => {
		renderAppWithStub(
			"/replays/60758c/2026-09-06T22-33-15.057Z?view=context",
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

	it("opens the stopped step from Runs in the same workspace", async () => {
		renderAppWithStub(
			"/",
			new Map<string, unknown>([["/api/runs", history([stoppedRow()])]]),
		);
		const link = await screen.findByRole("link", { name: /^build/u });
		const href = link.getAttribute("href") ?? "";
		expect(href).toBe(`/runs/${RUN}/stages/build`);
		cleanup();

		renderRunDetail(
			new Map<string, unknown>([
				[
					`/api/runs/${RUN}/stages/build/history`,
					{
						...emptyHistory("audit-log", "unused"),
						attempt: {
							kind: "stopped-stage",
							caseId: "audit-log",
							run: RUN,
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
			[],
			href,
		);

		expect(
			await screen.findByText("build stage graded C; minimum grade is B"),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Context & cost" }),
		).toHaveAttribute("aria-pressed", "true");
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
			"/groups/group-a/reps/group-a-rep-1/attempt?view=context",
			new Map<string, unknown>([
				[
					"/api/groups/group-a/reps/group-a-rep-1/attempt/result",
					{
						schemaVersion: 2,
						caseId: "case-a",
						groupId: "group-a",
						repId: "group-a-rep-1",
						ordinal: 1,
						mode: "session",
						lineage: { kind: "SESSION", lineage: "session-lineage" },
						outcome: "SUCCESSFUL",
						stages: [],
						finalOutcome: { status: "NOT_APPLICABLE" },
						metrics: { status: "COMPLETE", calls: [] },
						workerTrajectorySteps: 0,
						elapsedMs: 0,
					},
				],
				[
					"/api/groups/group-a/reps/group-a-rep-1/attempt/history",
					emptyHistory("case-a", "group-a-rep-1"),
				],
				[
					"/api/groups/group-a/reps/group-a-rep-1/attempt/history/requests",
					emptyRequestSeries(),
				],
				[
					"/api/groups/group-a/reps/group-a-rep-1/attempt/history/agents",
					{
						state: "unavailable",
						reason: "the attempt has no saved transcript",
					},
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
