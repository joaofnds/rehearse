import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import {
	renderRunDetail,
	RUN,
	stoppedAtBuild,
	history,
} from "#client/test-support/run-detail";
import { FakeEventSource } from "#client/test-support/event-source";
import { LiveReply } from "#client/test-support/live-reply";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import {
	SHELL_BASELINE,
	renderAppAt,
	renderAppWithStub,
} from "#client/test-support/render-app";
import { runRow } from "#client/test-support/runs-in-flight";
import { recordStage, runRecord } from "#client/test-support/run-record";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the run workspace", () => {
	it("keeps an interrupted step's missing record and cost unknown", async () => {
		const base = stoppedAtBuild();
		renderRunDetail(
			new Map<string, unknown>([
				["/api/runs", history([runRow({ run: RUN, status: "INTERRUPTED" })])],
				[`/api/runs/${RUN}`, { ...base, stages: [recordStage("build")] }],
			]),
		);
		const graph = await screen.findByRole("region", { name: "Task graph" });
		const step = within(graph).getByRole("button", { name: /^build/u });
		expect(step).toHaveTextContent("step record missing");
		expect(step).not.toHaveTextContent("$0.00");
		expect(step).not.toHaveTextContent("never ran");
	});

	it("names a Judge left waiting by an ended run", async () => {
		const base = stoppedAtBuild();
		renderRunDetail(
			new Map([
				[
					`/api/runs/${RUN}`,
					{
						...base,
						stages: [recordStage("build", { status: "awaiting-judgment" })],
					},
				],
			]),
		);
		const graph = await screen.findByRole("region", { name: "Task graph" });
		expect(
			within(graph).getByRole("button", { name: /^build/u }),
		).toHaveTextContent("judge never returned");
	});

	it("offers replay and instruction testing from a paused source", async () => {
		const base = stoppedAtBuild();
		const stages = base.stages.map((stage) =>
			stage.stage === "build"
				? {
						...stage,
						status: "graded",
						checkpoint: "recorded",
						readManifest: {
							state: "available",
							entries: [
								{
									path: "skills/build/SKILL.md",
									half: "corpus",
									role: "stage skill",
									evidence: "declared",
									sha256: "a".repeat(64),
									state: "unchanged",
								},
							],
						},
					}
				: stage,
		);
		renderRunDetail(
			new Map<string, unknown>([
				[
					"/api/runs",
					history([
						{
							...runRow({ run: RUN, status: "PAUSED:build" }),
							replayableStages: ["build"],
						},
					]),
				],
				[
					`/api/runs/${RUN}`,
					{
						...base,
						status: { state: "available", status: "PAUSED:build" },
						stages,
					},
				],
			]),
		);
		expect(
			await screen.findByRole("button", { name: "Replay step 2" }),
		).toBeEnabled();
		expect(
			screen.getByRole("link", { name: "Test an instruction" }),
		).toHaveAttribute("href", expect.stringContaining("sourceStep=build"));
		const graph = screen.getByRole("region", { name: "Task graph" });
		expect(
			within(graph).getByRole("button", { name: /^verify/u }),
		).toHaveTextContent("never ran");
	});

	it("shows the saved human verdict, summary and classified findings in Results", async () => {
		renderRunDetail(
			new Map([
				[
					`/api/runs/${RUN}`,
					{
						...stoppedAtBuild(),
						humanReview: {
							state: "available",
							review: {
								verdict: "REJECT",
								summary: "The Judge missed the audit boundary.",
								findings: [
									{
										description: "The endpoint skips authorization.",
										stage: "build",
										judgeAssessment: "MISSED",
										rubricId: "authorization",
										paths: ["src/audit.ts"],
									},
								],
							},
						},
					},
				],
			]),
		);
		const review = await screen.findByRole("region", { name: "Human review" });
		expect(review).toHaveTextContent("REJECT");
		expect(review).toHaveTextContent("The Judge missed the audit boundary.");
		expect(review).toHaveTextContent("The endpoint skips authorization.");
		expect(review).toHaveTextContent("build · MISSED · authorization");
		expect(review).toHaveTextContent("src/audit.ts");
	});

	it.each(["activity", "context"])(
		"uses the lightweight listing in %s",
		async (view) => {
			const server = new FakeServer(
				new Map([
					...[...SHELL_BASELINE].map(
						([path, body]) => [`GET ${path}`, { status: 200, body }] as const,
					),
					[
						"GET /api/run-listing",
						{
							status: 200,
							body: history([runRow({ run: RUN, status: "COMPLETE" })]),
						},
					],
					[`GET /api/runs/${RUN}`, { status: 200, body: stoppedAtBuild() }],
				]),
			);
			server.install();
			renderAppAt(`/runs/${RUN}?view=${view}`);
			await screen.findByRole("region", { name: "Task graph" });
			expect(server.sent.some(({ pathname }) => pathname === "/api/runs")).toBe(
				false,
			);
		},
	);

	it("opens the selected step's Judge review", async () => {
		renderRunDetail();
		expect(
			await screen.findByRole("link", { name: "Review this Judge" }),
		).toHaveAttribute("href", `/calibration/runs/${RUN}/stages/build`);
	});

	it("keeps provenance and incomplete token and cost readings visible in Context", async () => {
		const base = stoppedAtBuild();
		const build = recordStage("build", {
			status: "stopped",
			tokens: {
				state: "available",
				input: 12,
				totalInput: 21,
				output: 3,
				cacheRead: 4,
				cacheWrite: 5,
				missing: [{ part: "build judge", reason: "usage absent" }],
			},
			artifactsIn: {
				entries: [
					{
						from: "upstream checkpoint",
						target: "acme-api",
						upstream: "shape",
						checkpointShortId: {
							state: "available",
							shortId: "audit-log/r7/s1",
						},
					},
				],
				missing: [],
			},
		});
		renderRunDetail(
			new Map([
				[
					`/api/runs/${RUN}`,
					{
						...base,
						stages: [base.stages[0], build],
						totals: {
							...base.totals,
							cost: {
								state: "available",
								usd: 1.2,
								parts: [{ part: "build session", usd: 1.2 }],
								missing: [{ part: "build judge", reason: "metrics absent" }],
							},
						},
					},
				],
			]),
			[],
			`/runs/${RUN}?view=context&step=build`,
		);
		const setup = await screen.findByRole("region", {
			name: "Run setup & provenance",
		});
		expect(setup).toHaveTextContent("audit-log/r7/s1");
		expect(setup).toHaveTextContent("acme-api @ e91f2a0c");
		expect(setup).toHaveTextContent("claude-opus-4 / high");
		expect(
			within(setup).getByRole("region", { name: "Selected step tokens" }),
		).toHaveTextContent("Missing build judge: usage absent");
		expect(
			within(setup).getByRole("region", { name: "Run cost breakdown" }),
		).toHaveTextContent("Missing build judge: metrics absent");
		expect(setup).toHaveTextContent("$1.20 · partial");
	});

	it("carries the selected source and actual skill into instruction testing", async () => {
		const base = stoppedAtBuild();
		const stages = base.stages.map((stage) =>
			stage.stage === "build"
				? {
						...stage,
						readManifest: {
							state: "available",
							entries: [
								{
									path: "skills/build/SKILL.md",
									half: "corpus",
									role: "stage skill",
									evidence: "declared",
									sha256: "a".repeat(64),
									state: "unchanged",
								},
							],
						},
					}
				: stage,
		);
		renderRunDetail(
			new Map<string, unknown>([
				[
					"/api/runs",
					history([
						{
							...runRow({ run: RUN, status: "STOPPED:build" }),
							replayableStages: ["build"],
						},
					]),
				],
				[`/api/runs/${RUN}`, { ...base, stages }],
			]),
		);
		const editLink = await screen.findByRole("link", {
			name: "Test an instruction",
		});
		const url = new URL(
			editLink.getAttribute("href") ?? "",
			"http://localhost",
		);
		expect(url.pathname).toBe("/corpus");
		expect(Object.fromEntries(url.searchParams)).toEqual({
			file: "skills/build/SKILL.md",
			sourceRun: RUN,
			sourceStep: "build",
		});
	});

	it("opens ended runs on Results and keeps the selected step across all views", async () => {
		const router = renderRunDetail(new Map(), [], `/runs/${RUN}?step=shape`);
		expect(
			await screen.findByRole("button", { name: "Results" }),
		).toHaveAttribute("aria-pressed", "true");
		fireEvent.click(screen.getByRole("button", { name: "Activity" }));
		expect(
			await screen.findByRole("region", { name: "Live agent session" }),
		).toHaveTextContent("Step 1 · shape");
		fireEvent.click(screen.getByRole("button", { name: "Context & cost" }));
		await waitFor(() => {
			expect(router.state.location.search).toMatchObject({
				view: "context",
				step: "shape",
			});
		});
		expect(
			await screen.findByRole("heading", {
				name: "Context & cost · saved evidence",
			}),
		).toBeInTheDocument();
		expect(
			screen.getByRole("region", { name: "Run setup & provenance" }),
		).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Results" }));
		expect(
			await screen.findByRole("region", { name: "Step report" }),
		).toHaveTextContent("Step 1 · shape");
	});

	it("opens a running run directly on Activity and keeps the workflow available", async () => {
		renderAppWithStub(
			`/runs/${RUN}`,
			new Map<string, unknown>([
				["/api/runs", history([runRow({ run: RUN, stage: "build" })])],
				[
					`/api/runs/${RUN}`,
					runRecord({
						run: RUN,
						running: "build",
						stages: [
							recordStage("shape", { status: "graded" }),
							recordStage("build"),
						],
					}),
				],
			]),
		);

		expect(
			await screen.findByRole("button", { name: "Activity" }),
		).toHaveAttribute("aria-pressed", "true");
		expect(
			screen.getByRole("region", { name: "Live agent session" }),
		).toHaveTextContent("Step 2 · build");
		expect(
			screen.getByRole("region", { name: "Task graph" }),
		).toBeInTheDocument();
	});

	it("keeps an independent final FAIL beside accepted step grades", async () => {
		const record = stoppedAtBuild();
		renderRunDetail(
			new Map([
				[
					`/api/runs/${RUN}`,
					{ ...record, finalOutcome: { status: "JUDGED", verdict: "FAIL" } },
				],
			]),
		);

		expect(
			await screen.findByRole("region", {
				name: "Task grade · graded on its own",
			}),
		).toHaveTextContent("FAIL");
		expect(
			within(screen.getByRole("region", { name: "Task graph" })).getByText(
				"shape",
			),
		).toBeInTheDocument();
	});
	it("keeps Activity and the chosen step when a live run completes", async () => {
		let ended = false;
		const record = stoppedAtBuild();
		const server = new FakeServer(
			new Map<string, Reply | LiveReply>([
				...[...SHELL_BASELINE].map(
					([path, body]) => [`GET ${path}`, { status: 200, body }] as const,
				),
				[
					"GET /api/run-listing",
					new LiveReply(() => ({
						status: 200,
						body: history([
							runRow({
								run: RUN,
								stage: "build",
								status: ended ? "COMPLETE" : "RUNNING",
							}),
						]),
					})),
				],
				[
					`GET /api/runs/${RUN}`,
					new LiveReply(() => ({
						status: 200,
						body: {
							...record,
							finalOutcome: ended
								? { status: "JUDGED", verdict: "PASS" }
								: { status: "PENDING", stage: "build" },
						},
					})),
				],
			]),
		);
		server.install();
		renderAppAt(`/runs/${RUN}`);
		const graph = await screen.findByRole("region", { name: "Task graph" });
		fireEvent.click(within(graph).getByRole("button", { name: /^shape/u }));
		await waitFor(() => {
			expect(
				screen.getByRole("region", { name: "Live agent session" }),
			).toHaveTextContent("Step 1 · shape");
		});
		const stream = FakeEventSource.openOn(`/api/runs/${RUN}/events`);
		ended = true;
		stream.deliver();

		await waitFor(() => {
			expect(stream.closed).toBe(true);
		});
		expect(screen.getByRole("button", { name: "Activity" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(
			screen.getByRole("region", { name: "Live agent session" }),
		).toHaveTextContent("Step 1 · shape");
		expect(
			screen.queryByRole("button", { name: "Pause after this step" }),
		).not.toBeInTheDocument();
	});

	it("refuses replay in the inspector of an unfinished source", async () => {
		const record = runRecord({
			run: RUN,
			running: "build",
			stages: [recordStage("build")],
		});
		renderAppWithStub(
			`/runs/${RUN}`,
			new Map<string, unknown>([
				["/api/runs", history([runRow({ run: RUN, stage: "build" })])],
				[`/api/runs/${RUN}`, record],
			]),
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Inputs & output" }),
		);

		const dialog = await screen.findByRole("dialog");
		expect(
			within(dialog).getByRole("button", { name: "Replay from checkpoint" }),
		).toHaveAttribute("aria-disabled", "true");
		expect(dialog).toHaveTextContent(
			"build has no completed step record to replay",
		);
	});
});
