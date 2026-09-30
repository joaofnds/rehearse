import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen, within } from "@testing-library/react";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { renderAppWithStub } from "#client/test-support/render-app";
import { recordStage, runRecord } from "#client/test-support/run-record";
import { graded, notYet, runRow } from "#client/test-support/runs-in-flight";

type HistoryRow = RunHistoryResponse["rows"][number];

const RUN = "2026-09-30T10-00-00.000Z";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function history(rows: readonly HistoryRow[]): RunHistoryResponse {
	return { rows: [...rows], launches: [], unreadable: [] };
}

type PipelineRow = Extract<HistoryRow, { readonly kind: "run" }>;

/** The monitor on one run in flight at build, its record served beside it. */
function renderMonitor(
	row: PipelineRow,
	extra: ReadonlyMap<string, unknown> = new Map(),
): void {
	renderAppWithStub(
		"/monitor",
		new Map<string, unknown>([
			["/api/runs", history([row])],
			[
				`/api/runs/${row.run}`,
				runRecord({
					run: row.run,
					running: "build",
					stages: [
						recordStage("plan", { status: "graded" }),
						recordStage("build"),
					],
				}),
			],
			...extra,
		]),
	);
}

/** The header the run's title heads, apart from the bar that repeats its readings. */
async function header(): Promise<HTMLElement> {
	const title = await screen.findByRole("heading", { level: 1 });
	const shown = title.closest("header");
	if (shown === null) {
		throw new Error("the run's title heads no header");
	}

	return shown;
}

describe("/monitor", () => {
	it("lists the run's stages in pipeline order with the running one marked", async () => {
		renderAppWithStub(
			"/monitor",
			new Map<string, unknown>([
				[
					"/api/runs",
					history([
						runRow({
							run: RUN,
							stage: "build",
							grades: [graded("plan", "B+"), notYet("build"), notYet("review")],
						}),
					]),
				],
				[
					`/api/runs/${RUN}`,
					runRecord({
						run: RUN,
						running: "build",
						stages: [
							recordStage("plan", { status: "graded" }),
							recordStage("build"),
							recordStage("review"),
						],
					}),
				],
			]),
		);

		const graph = await screen.findByRole("region", { name: "Task graph" });
		const nodes = within(graph).getAllByRole("listitem");
		expect(
			nodes.map(
				(node) =>
					within(node).getByText(/^(?:plan|build|review)$/u).textContent,
			),
		).toEqual(["plan", "build", "review"]);
		expect(
			nodes.map(
				(node) =>
					within(node).getByText(/accepted|running|queued/u).textContent,
			),
		).toEqual(["✓accepted", "●session running", "○queued"]);
	});

	describe("the identity header", () => {
		it("names the run, its case, corpus version, target, commit, model and effort", async () => {
			renderMonitor(
				runRow({
					run: RUN,
					corpusVersion: { kind: "version", digest: "a41c7e99" },
				}),
			);

			const shown = await header();

			expect(
				within(shown).getByRole("heading", { level: 1 }),
			).toHaveTextContent("Run r-0148 in progress");
			expect(shown).toHaveTextContent("audit-log");
			expect(shown).toHaveTextContent("corpus@a41c7e");
			expect(shown).toHaveTextContent(
				"target acme-api @ e91f2a · claude-opus-4 · effort high",
			);
		});

		it("offers Stop & restore repo for a run the browser launched", async () => {
			renderMonitor(runRow({ run: RUN, launchId: "launch-1" }));

			expect(
				within(await header()).getByRole("button", {
					name: "Stop & restore repo",
				}),
			).toBeEnabled();
		});

		it("says on Stop & restore repo why a run started outside the browser cannot be stopped from it", async () => {
			renderMonitor(runRow({ run: RUN, launchId: undefined }));

			expect(
				within(await header()).getByRole("button", {
					name: "Started outside the browser, so it stops only where it was started",
				}),
			).toHaveAttribute("aria-disabled", "true");
		});

		it("asks the run to pause after the step in flight", async () => {
			renderMonitor(
				runRow({ run: RUN }),
				new Map([[`/api/runs/${RUN}/pause`, {}]]),
			);

			fireEvent.click(
				within(await header()).getByRole("button", {
					name: "Pause after this step",
				}),
			);

			expect(
				await within(await header()).findByText(
					"pause requested · ends after this step is judged",
				),
			).toBeInTheDocument();
		});
	});

	describe("the spend band", () => {
		function band(): Promise<HTMLElement> {
			return screen.findByRole("region", { name: "Spend" });
		}

		it("shows the run's spend against its ceiling, its burn rate and its elapsed time", async () => {
			renderMonitor(
				runRow({
					run: RUN,
					runSpentUsd: 1.83,
					ceilingUsd: 20,
					elapsedMs: 372_000,
					measuredAt: new Date().toISOString(),
				}),
			);

			const shown = await band();

			expect(shown).toHaveTextContent("Spent this run$1.83of $20.00 limit");
			expect(shown).toHaveTextContent("Burn rate$0.30 /min");
			expect(shown).toHaveTextContent("Elapsed06:12");
		});

		it("states the share of the ceiling used in words and on its meter", async () => {
			renderMonitor(runRow({ run: RUN, runSpentUsd: 1.83, ceilingUsd: 20 }));

			const shown = await band();

			expect(
				within(shown).getByRole("img", {
					name: "Spent 1.83 dollars of a 20.00 dollar ceiling",
				}),
			).toBeInTheDocument();
			expect(shown).toHaveTextContent(
				"$0.00" +
					"9% of ceiling used · stops mid-step at the ceiling" +
					"$20.00",
			);
		});

		it("shows a dash with its reason for run spend a run recorded before it existed", async () => {
			renderMonitor(runRow({ run: RUN, ceilingUsd: 20 }));

			const shown = await band();

			expect(shown).toHaveTextContent("Spent this run— run spend not recorded");
			expect(shown).toHaveTextContent("Burn rate— run spend not recorded");
			expect(within(shown).queryByRole("img")).not.toBeInTheDocument();
		});

		it("shows the run's tokens in and out in thousands", async () => {
			renderMonitor(
				runRow({ run: RUN, runTokens: { input: 842_300, output: 31_400 } }),
			);

			const shown = await band();

			expect(shown).toHaveTextContent("Tokens in / out842k / 31k");
		});

		it("shows a dash with its reason for tokens a run recorded before they existed", async () => {
			renderMonitor(runRow({ run: RUN }));

			const shown = await band();

			expect(shown).toHaveTextContent(
				"Tokens in / out— run tokens not recorded",
			);
		});
	});
});

describe("/monitor task graph", () => {
	const DIGEST = "a41c7e".padEnd(64, "0");

	function renderGraph(
		stages: readonly ReturnType<typeof recordStage>[],
	): void {
		renderAppWithStub(
			"/monitor",
			new Map<string, unknown>([
				["/api/runs", history([runRow({ run: RUN, stage: "build" })])],
				[
					`/api/runs/${RUN}`,
					{
						...runRecord({ run: RUN, running: "build", stages }),
						minimumGrade: { state: "available", letter: "B-" },
					},
				],
			]),
		);
	}

	async function node(stage: string): Promise<HTMLElement> {
		const graph = await screen.findByRole("region", { name: "Task graph" });
		const shown = within(graph)
			.getAllByRole("listitem")
			.find((item) => within(item).queryByText(stage) !== null);
		if (shown === undefined) {
			throw new Error(`the graph draws no node for ${stage}`);
		}

		return shown;
	}

	it("shows a finished stage's cost, duration, fired blockers, corpus version and checkpoint", async () => {
		renderGraph([
			recordStage("plan", {
				status: "graded",
				sessionCost: { state: "available", usd: 0.9 },
				judgeCost: { state: "available", usd: 0.22 },
				wallTime: { state: "available", ms: 242_000 },
				blockers: { state: "available", fired: 2, total: 4 },
				corpusVersion: { kind: "version", digest: DIGEST },
				checkpoint: "recorded",
				checkpointShortId: { state: "available", shortId: "ckpt-0148-s1" },
			}),
			recordStage("build"),
		]);

		const shown = await node("plan");

		expect(shown).toHaveTextContent("$1.12");
		expect(shown).toHaveTextContent("4m02s");
		expect(shown).toHaveTextContent("2 of 4 fired");
		expect(shown).toHaveTextContent("a41c7e");
		expect(shown).toHaveTextContent("◆ckpt-0148-s1");
		expect(shown).toHaveTextContent("contribution pending");
	});

	it("shows a stage not started as costing nothing, with no checkpoint yet", async () => {
		renderGraph([recordStage("build"), recordStage("review")]);

		const shown = await node("review");

		expect(shown).toHaveTextContent("$0.00");
		expect(shown).toHaveTextContent("◇no checkpoint yet");
		expect(shown).toHaveTextContent("not started");
	});

	it("shows the running stage's session spend so far as its cost", async () => {
		renderGraph([recordStage("build")]);

		expect(await node("build")).toHaveTextContent("$0.90");
	});

	it("offers replay from a stage's checkpoint", async () => {
		renderGraph([
			recordStage("plan", { status: "graded", checkpoint: "recorded" }),
			recordStage("build"),
		]);

		expect(
			within(await node("plan")).getByRole("button", {
				name: "Replay plan from its checkpoint",
			}),
		).not.toHaveAttribute("aria-disabled");
	});

	it("says on replay why a stage without a checkpoint cannot be replayed", async () => {
		renderGraph([recordStage("build")]);

		expect(
			within(await node("build")).getByRole("button", {
				name: "build has no checkpoint to replay from",
			}),
		).toHaveAttribute("aria-disabled", "true");
	});

	it("names the task and its step count, and what a step below the minimum grade does", async () => {
		renderGraph([recordStage("plan"), recordStage("build")]);

		const graph = await screen.findByRole("region", { name: "Task graph" });

		expect(within(graph).getByRole("heading", { level: 2 })).toHaveTextContent(
			"Task · audit-log · 2 steps, in order",
		);
		expect(graph).toHaveTextContent(
			"Minimum grade for every step in this task is B-. A task below it stops the run and restores acme-api to e91f2a.",
		);
	});
});
