import {
	afterEach,
	describe,
	expect,
	it,
	onTestFinished,
	setSystemTime,
} from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { FakeEventSource } from "#client/test-support/event-source";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import {
	renderAppAt,
	renderAppWithStub,
	SHELL_BASELINE,
	stubFetchFailing,
} from "#client/test-support/render-app";
import { recordStage, runRecord } from "#client/test-support/run-record";
import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import type { AnalysisReading } from "#server/culprit-analyses";
import type { StageJudge } from "#server/stage-judge";
import type { StageSession } from "#server/stage-session";
import type { StageTimes } from "#server/stage-times";
import { graded, notYet, runRow } from "#client/test-support/runs-in-flight";

type HistoryRow = RunHistoryResponse["rows"][number];

const RUN = "2026-09-30T10-00-00.000Z";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
});

function history(rows: readonly HistoryRow[]): RunHistoryResponse {
	return { rows: [...rows], launches: [], unreadable: [] };
}

type PipelineRow = Extract<HistoryRow, { readonly kind: "run" }>;

/** What the server answers for one run in flight at build: its row and its record. */
function monitorBodies(row: PipelineRow): ReadonlyMap<string, unknown> {
	return new Map<string, unknown>([
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
	]);
}

/** The monitor on one run in flight at build, its record served beside it. */
function renderMonitor(
	row: PipelineRow,
	extra: ReadonlyMap<string, unknown> = new Map(),
): void {
	renderAppWithStub(
		"/monitor",
		new Map<string, unknown>([...monitorBodies(row), ...extra]),
	);
}

/** The server answering from now on with the run's later readings. */
function serveMonitor(row: PipelineRow): void {
	stubFetchByPath(
		new Map<string, unknown>([...SHELL_BASELINE, ...monitorBodies(row)]),
	);
}

/** The task graph's node for a stage. */
async function graphNode(stage: string): Promise<HTMLElement> {
	const graph = await screen.findByRole("region", { name: "Task graph" });
	const shown = within(graph)
		.getAllByRole("listitem")
		.find((item) => within(item).queryByText(stage) !== null);
	if (shown === undefined) {
		throw new Error(`the graph draws no node for ${stage}`);
	}

	return shown;
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

		it("links the run's name to its run detail", async () => {
			renderMonitor(runRow({ run: RUN }));

			expect(
				within(await header()).getByRole("link", { name: "r-0148" }),
			).toHaveAttribute("href", `/runs/${RUN}`);
		});

		it("offers Stop & restore repo for a run the browser launched", async () => {
			renderMonitor(runRow({ run: RUN, launchId: "launch-1" }));

			expect(
				within(await header()).getByRole("button", {
					name: "Stop & restore repo",
				}),
			).toBeEnabled();
		});

		it("shows beside Stop & restore repo why a run started outside the browser cannot be stopped from it", async () => {
			renderMonitor(runRow({ run: RUN, launchId: undefined }));

			const shown = await header();

			const stop = within(shown).getByRole("button", {
				name: "Stop & restore repo",
			});
			expect(stop).toHaveAttribute("aria-disabled", "true");
			expect(stop).toHaveAccessibleDescription(
				"Started outside the browser, so it stops only where it was started",
			);
			const reason = within(shown).getByText(
				"Started outside the browser, so it stops only where it was started",
			);
			expect(reason).toBeVisible();
			expect(reason.closest(".sr-only")).toBeNull();
		});

		it("shows no reason beside Stop & restore repo for a run the browser launched", async () => {
			renderMonitor(runRow({ run: RUN, launchId: "launch-1" }));

			expect(
				within(await header()).queryByText(
					"Started outside the browser, so it stops only where it was started",
				),
			).not.toBeInTheDocument();
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

		it("acknowledges the pause with the paused glyph at the design's meta size", async () => {
			renderMonitor(
				runRow({ run: RUN }),
				new Map([[`/api/runs/${RUN}/pause`, {}]]),
			);

			fireEvent.click(
				within(await header()).getByRole("button", {
					name: "Pause after this step",
				}),
			);

			const acknowledged = await within(await header()).findByText(
				"pause requested · ends after this step is judged",
			);
			expect(acknowledged).toHaveTextContent(/^‖/u);
			expect(acknowledged).toHaveClass("text-11-5");
		});

		it("acknowledges the stop with the stopped glyph at the design's meta size", async () => {
			renderMonitor(
				runRow({ run: RUN, launchId: "launch-1" }),
				new Map([["/api/launches/launch-1/stop", {}]]),
			);

			fireEvent.click(
				within(await header()).getByRole("button", {
					name: "Stop & restore repo",
				}),
			);

			const acknowledged = await within(await header()).findByText(
				"stop requested",
			);
			expect(acknowledged).toHaveTextContent(/^◼/u);
			expect(acknowledged).toHaveClass("text-11-5");
		});

		it("sets why Stop & restore repo is unavailable at the design's meta size", async () => {
			renderMonitor(runRow({ run: RUN, launchId: undefined }));

			expect(
				within(await header()).getByText(
					"Started outside the browser, so it stops only where it was started",
				),
			).toHaveClass("text-11-5");
		});
	});

	describe("the spend band", () => {
		function band(): Promise<HTMLElement> {
			return screen.findByRole("region", { name: "Spend" });
		}

		/** The run measured 6m12s at its latest event, a minute before the clock reads. */
		const MEASURED_AT = "2026-09-30T10:06:12.000Z";

		function renderMeasuredRun(): void {
			setSystemTime(new Date("2026-09-30T10:07:12.000Z"));
			renderMonitor(
				runRow({
					run: RUN,
					runSpentUsd: 1.83,
					ceilingUsd: 20,
					elapsedMs: 372_000,
					measuredAt: MEASURED_AT,
				}),
			);
		}

		it("shows the run's spend against its ceiling", async () => {
			renderMeasuredRun();

			expect(await band()).toHaveTextContent(
				"Spent this run$1.83of $20.00 limit",
			);
		});

		it("shows the burn rate over the elapsed time the run measured with its spend", async () => {
			renderMeasuredRun();

			expect(await band()).toHaveTextContent("Burn rate$0.30 /min");
		});

		it("shows the elapsed time advancing from the run's latest measurement", async () => {
			renderMeasuredRun();

			expect(await band()).toHaveTextContent("Elapsed07:12");
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

		describe("the remaining estimate", () => {
			const THREE_STAGE_RECORD = runRecord({
				run: RUN,
				running: "build",
				stages: [
					recordStage("plan", { status: "graded" }),
					recordStage("build"),
					recordStage("review"),
				],
			});

			/** Earlier runs of the case took a median 6m40s in build and 2m in review. */
			const EARLIER_TIMES: StageTimes = {
				stages: [
					{ stage: "plan", state: "available", medianMs: 90_000 },
					{ stage: "build", state: "available", medianMs: 400_000 },
					{ stage: "review", state: "available", medianMs: 120_000 },
				],
			};

			/** Waits for the figure, which reads a second query after the band shows. */
			async function expectEstimate(text: string): Promise<void> {
				const shown = await band();
				await waitFor(() => {
					expect(shown).toHaveTextContent(text);
				});
			}

			/** The clock reads a minute after the run's latest event, as in the band's other tests. */
			function renderEstimatedRun(
				stageElapsedMs: number,
				times: StageTimes = EARLIER_TIMES,
			): void {
				setSystemTime(new Date("2026-09-30T10:07:12.000Z"));
				renderMonitor(
					runRow({
						run: RUN,
						runSpentUsd: 1.83,
						ceilingUsd: 20,
						elapsedMs: 372_000,
						stageElapsedMs,
						measuredAt: MEASURED_AT,
					}),
					new Map<string, unknown>([
						[`/api/runs/${RUN}`, THREE_STAGE_RECORD],
						[`/api/runs/${RUN}/stage-times`, times],
					]),
				);
			}

			it("estimates the steps left from earlier runs of the case, less the running step's time so far, at the burn rate", async () => {
				renderEstimatedRun(40_000);

				await expectEstimate("Remaining step 3, at current rate≈ $2.07 · 7m");
			});

			it("counts a running step past its earlier median as nothing left, and still counts the steps after it", async () => {
				renderEstimatedRun(440_000);

				await expectEstimate("Remaining step 3, at current rate≈ $0.59 · 2m");
			});

			it("names the steps after the running one, as the design labels them", async () => {
				renderMonitor(
					runRow({ run: RUN }),
					new Map<string, unknown>([
						[
							`/api/runs/${RUN}`,
							runRecord({
								run: RUN,
								running: "build",
								stages: [
									recordStage("plan", { status: "graded" }),
									recordStage("build"),
									recordStage("review"),
									recordStage("ship"),
								],
							}),
						],
					]),
				);

				await expectEstimate("Remaining steps 3 to 4, at current rate");
			});

			describe("when it has none", () => {
				it("says no earlier run of the case exists", async () => {
					renderEstimatedRun(40_000, {
						stages: ["plan", "build", "review"].map((stage) => ({
							stage,
							state: "unavailable",
							reasons: ["no prior run of this case"],
						})),
					});

					await expectEstimate(
						"Remaining step 3, at current rate— no prior run of this case",
					);
				});

				it("says the run records no run spend to set the rate", async () => {
					setSystemTime(new Date(MEASURED_AT));
					renderMonitor(
						runRow({ run: RUN, stageElapsedMs: 100_000 }),
						new Map<string, unknown>([
							[`/api/runs/${RUN}`, THREE_STAGE_RECORD],
							[`/api/runs/${RUN}/stage-times`, EARLIER_TIMES],
						]),
					);

					await expectEstimate(
						"Remaining step 3, at current rate— run spend not recorded",
					);
				});

				it("says the run recorded no start for the running step", async () => {
					renderMonitor(
						runRow({ run: RUN, runSpentUsd: 1.83 }),
						new Map<string, unknown>([
							[`/api/runs/${RUN}`, THREE_STAGE_RECORD],
							[`/api/runs/${RUN}/stage-times`, EARLIER_TIMES],
						]),
					);

					await expectEstimate(
						"Remaining step 3, at current rate— the running step's start is not recorded",
					);
				});

				it("says every step has finished while the run's final judge returns", async () => {
					setSystemTime(new Date(MEASURED_AT));
					renderMonitor(
						runRow({
							run: RUN,
							runSpentUsd: 1.83,
							elapsedMs: 372_000,
							stageElapsedMs: 100_000,
							measuredAt: MEASURED_AT,
						}),
						new Map<string, unknown>([
							[
								`/api/runs/${RUN}`,
								runRecord({
									run: RUN,
									running: "review",
									stages: [
										recordStage("plan", { status: "graded" }),
										recordStage("build", { status: "graded" }),
										recordStage("review", { status: "graded" }),
									],
								}),
							],
							[`/api/runs/${RUN}/stage-times`, EARLIER_TIMES],
						]),
					);

					await expectEstimate(
						"Remaining, at current rate— every step has finished",
					);
				});

				it("says when it could not read the earlier runs", async () => {
					renderMonitor(runRow({ run: RUN, runSpentUsd: 1.83 }));

					await expectEstimate(
						"Remaining step 2, at current rate— could not read the earlier runs of this case",
					);
				});
			});
		});
	});
});

describe("/monitor task graph", () => {
	const PRODUCED_NOTE =
		"A step shows what its record says it produced until an analysis of the ended run gives one agent's reading of its contribution to the task's final grade.";
	const DIGEST = "a41c7e".padEnd(64, "0");
	const MINIMUM_B_MINUS: RunRecordResponse["minimumGrade"] = {
		state: "available",
		letter: "B-",
	};

	function renderGraph(
		stages: readonly ReturnType<typeof recordStage>[],
		runUnder?: CorpusMeasurement,
		analyses: ReadonlyMap<string, AnalysisReading> = new Map([
			[
				`/api/runs/${RUN}/analyses`,
				{
					run: RUN,
					newest: null,
					earlierCount: 0,
					unreadable: [],
					request: { model: "sonnet", capUsd: 1, refusal: null },
				},
			],
		]),
		minimumGrade: RunRecordResponse["minimumGrade"] = MINIMUM_B_MINUS,
	): void {
		renderAppWithStub(
			"/monitor",
			new Map<string, unknown>([
				...analyses,
				[
					"/api/runs",
					history([
						runRow({ run: RUN, stage: "build", corpusVersion: runUnder }),
					]),
				],
				[
					`/api/runs/${RUN}`,
					{
						...runRecord({ run: RUN, running: "build", stages }),
						minimumGrade,
					},
				],
			]),
		);
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

		const shown = await graphNode("plan");

		expect(shown).toHaveTextContent("$1.12");
		expect(shown).toHaveTextContent("4m02s");
		expect(shown).toHaveTextContent("2 of 4 fired");
		expect(shown).toHaveTextContent("a41c7e");
		expect(shown).toHaveTextContent("◆ckpt-0148-s1");
		expect(shown).toHaveTextContent("contribution pending");
	});

	it("shows what a finished stage produced, from its record, until an analysis exists", async () => {
		renderGraph([
			recordStage("plan", {
				status: "graded",
				artifactsOut: {
					...recordStage("plan").artifactsOut,
					commitSubjects: {
						state: "available",
						subjects: ["docs: add project glossary"],
					},
					changedPaths: {
						state: "available",
						paths: ["GLOSSARY.md", "AGENTS.md"],
					},
				},
			}),
			recordStage("build"),
		]);

		const plan = await graphNode("plan");

		expect(plan).toHaveTextContent("produced 1 commit, 2 files changed");
		expect(plan).not.toHaveTextContent("contribution pending");
	});

	it("shows the workflow-state changes a finished planning stage produced", async () => {
		renderGraph([
			recordStage("plan", {
				status: "graded",
				artifactsOut: {
					...recordStage("plan").artifactsOut,
					workflowState: {
						state: "available",
						changes: [
							{ path: "backlog/drafts/draft-1.md", change: "added" },
							{ path: "backlog/tasks/task-1.md", change: "modified" },
						],
					},
				},
			}),
			recordStage("build"),
		]);

		expect(await graphNode("plan")).toHaveTextContent(
			"produced 2 workflow-state changes",
		);
	});

	it("shows the files a finished stage changed when its record holds no commit subjects", async () => {
		renderGraph([
			recordStage("plan", {
				status: "graded",
				artifactsOut: {
					...recordStage("plan").artifactsOut,
					changedPaths: { state: "available", paths: ["src/audit.ts"] },
				},
			}),
			recordStage("build"),
		]);

		expect(await graphNode("plan")).toHaveTextContent(
			"produced 1 file changed",
		);
	});

	it("shows the newest analysis's phrase toward the task grade on a step that ran, over what it produced", async () => {
		renderGraph(
			[
				recordStage("plan", {
					status: "graded",
					checkpoint: "recorded",
					artifactsOut: {
						...recordStage("plan").artifactsOut,
						commitSubjects: { state: "available", subjects: [] },
						changedPaths: { state: "available", paths: [] },
					},
				}),
				recordStage("build"),
			],
			undefined,
			new Map([
				[
					`/api/runs/${RUN}/analyses`,
					{
						run: RUN,
						newest: {
							schemaVersion: 1,
							run: RUN,
							model: "sonnet",
							capUsd: 1,
							startedAt: "2026-09-30T10:30:00.000Z",
							durationMs: 41_000,
							bundleDigest: "b".repeat(64),
							bundleBytes: 1200,
							outcome: "recorded",
							culprit: null,
							narrative: "No step stands out.",
							pairedRerun: "None needed.",
							stages: [
								{
									stage: "plan",
									role: "contributing",
									note: "Plan left the scope open.",
									contribution: "left the scope the judge read open",
								},
								{ stage: "build", role: "never ran" },
							],
						},
						earlierCount: 0,
						unreadable: [],
						request: { model: "sonnet", capUsd: 1, refusal: null },
					},
				],
			]),
		);

		const plan = await graphNode("plan");

		expect(
			await within(plan).findByText("left the scope the judge read open"),
		).toBeInTheDocument();
		expect(plan).not.toHaveTextContent("produced");
	});

	it("shows a stage not started as costing nothing, with no checkpoint yet", async () => {
		renderGraph([recordStage("build"), recordStage("review")]);

		const shown = await graphNode("review");

		expect(shown).toHaveTextContent("$0.00");
		expect(shown).toHaveTextContent("◇no checkpoint yet");
		expect(shown).toHaveTextContent("not started");
	});

	it("shows the running stage's duration advancing from the run's latest measurement, and a finished one's as recorded", async () => {
		setSystemTime(new Date("2026-09-30T10:07:12.000Z"));
		renderAppWithStub(
			"/monitor",
			new Map<string, unknown>([
				[
					"/api/runs",
					history([
						runRow({
							run: RUN,
							stage: "build",
							stageElapsedMs: 182_000,
							measuredAt: "2026-09-30T10:06:12.000Z",
						}),
					]),
				],
				[
					`/api/runs/${RUN}`,
					runRecord({
						run: RUN,
						running: "build",
						stages: [
							recordStage("plan", {
								status: "graded",
								wallTime: { state: "available", ms: 125_000 },
							}),
							recordStage("build"),
						],
					}),
				],
			]),
		);

		expect(await graphNode("build")).toHaveTextContent("4m02s");
		expect(await graphNode("plan")).toHaveTextContent("2m05s");
	});

	it("shows the running stage's session spend so far as its cost", async () => {
		renderGraph([recordStage("build")]);

		expect(await graphNode("build")).toHaveTextContent("$0.90");
	});

	it("shows on the running stage, which has measured none of its own yet, the corpus version the header names", async () => {
		const latest: CorpusMeasurement = {
			kind: "version",
			digest: "b".repeat(64),
		};
		renderGraph(
			[
				recordStage("plan", { status: "graded", corpusVersion: latest }),
				recordStage("build"),
			],
			latest,
		);

		expect(await graphNode("build")).toHaveTextContent("bbbbbb");
	});

	it("draws the running stage's pulsing glyph in its status line's colour, as the design does", async () => {
		renderGraph([recordStage("build")]);

		const build = await graphNode("build");
		const glyph = build.querySelector("[class*='animate-live']");

		expect(glyph).not.toBeNull();
		expect(glyph).not.toHaveClass("text-accent-foreground");
	});

	it("draws no hover fill on a node, as the design's node keeps its own background", async () => {
		renderGraph([recordStage("build"), recordStage("review")]);

		const [button] = within(await graphNode("review")).getAllByRole("button");

		expect(button?.className).not.toContain("hover:");
	});

	it("reads a stage not started as having no corpus version", async () => {
		renderGraph([recordStage("build"), recordStage("review")], {
			kind: "version",
			digest: DIGEST,
		});

		expect(await graphNode("review")).toHaveTextContent("version not recorded");
	});

	it("shows a graded stage's letter", async () => {
		renderGraph([
			recordStage("plan", {
				status: "graded",
				grade: {
					state: "available",
					letter: "B+",
					verdict: "PASS",
					reachesMinimum: true,
				},
			}),
			recordStage("build"),
		]);

		expect(await graphNode("plan")).toHaveTextContent("B+");
	});

	it("reads a stage whose letter falls short of the run's minimum as stopped, whatever its judge's verdict", async () => {
		renderGraph([
			recordStage("plan", {
				status: "graded",
				grade: {
					state: "available",
					letter: "B",
					verdict: "CONTINUE",
					reachesMinimum: false,
				},
			}),
			recordStage("build"),
		]);

		expect(await graphNode("plan")).toHaveTextContent("stopped");
	});

	it("reads a judged stage by its record once the record is written, as no longer running", async () => {
		renderAppWithStub(
			"/monitor",
			new Map<string, unknown>([
				[
					"/api/runs",
					history([runRow({ run: RUN, stage: "plan", stageState: "judged" })]),
				],
				[
					`/api/runs/${RUN}`,
					runRecord({
						run: RUN,
						running: "plan",
						stages: [
							recordStage("plan", {
								status: "graded",
								grade: {
									state: "available",
									letter: "B+",
									verdict: "PASS",
									reachesMinimum: true,
								},
							}),
							recordStage("build"),
						],
					}),
				],
			]),
		);

		const plan = await graphNode("plan");

		expect(plan).toHaveTextContent("✓accepted");
		expect(plan.querySelector("[class*='animate-live']")).toBeNull();
	});

	it("reads a judged stage's cost and duration by its record once the record is written", async () => {
		setSystemTime(new Date("2026-09-30T10:07:12.000Z"));
		renderAppWithStub(
			"/monitor",
			new Map<string, unknown>([
				[
					"/api/runs",
					history([
						runRow({
							run: RUN,
							stage: "plan",
							stageState: "judged",
							stageElapsedMs: 182_000,
							measuredAt: "2026-09-30T10:06:12.000Z",
						}),
					]),
				],
				[
					`/api/runs/${RUN}`,
					runRecord({
						run: RUN,
						running: "plan",
						stages: [
							recordStage("plan", {
								status: "graded",
								wallTime: { state: "available", ms: 125_000 },
								sessionCost: { state: "available", usd: 0.9 },
								judgeCost: { state: "available", usd: 0.3 },
							}),
							recordStage("build"),
						],
					}),
				],
			]),
		);

		const plan = await graphNode("plan");

		expect(plan).toHaveTextContent("$1.20");
		expect(plan).toHaveTextContent("2m05s");
	});

	it("reads a stage waiting on its judge as awaiting judgment", async () => {
		renderGraph([
			recordStage("plan", { status: "awaiting-judgment" }),
			recordStage("build"),
		]);

		expect(await graphNode("plan")).toHaveTextContent("awaiting judgment");
	});

	it("shows a checkpoint recorded before short ids as recorded", async () => {
		renderGraph([
			recordStage("plan", { status: "graded", checkpoint: "recorded" }),
			recordStage("build"),
		]);

		expect(await graphNode("plan")).toHaveTextContent("◆checkpoint recorded");
	});

	it("counts the instruction files a stage loaded and the artifacts it declared", async () => {
		renderGraph([
			recordStage("plan", {
				status: "graded",
				instructionFiles: {
					state: "available",
					files: ["a.md", "b.md", "c.md"].map((path) => ({
						path,
						sha256: "0".repeat(64),
					})),
				},
				artifactsOut: {
					...recordStage("plan").artifactsOut,
					declared: { state: "available", paths: ["docs/plan.md"] },
				},
			}),
			recordStage("build"),
		]);

		const shown = await graphNode("plan");

		expect(shown).toHaveTextContent("↓ 3 instruction files in");
		expect(shown).toHaveTextContent("↑ 1 artifact out");
	});

	it("numbers each step in two digits", async () => {
		renderGraph([recordStage("build")]);

		expect(await graphNode("build")).toHaveTextContent(/^01build/u);
	});

	it("offers replay of a stage from the checkpoint the stage before it saved", async () => {
		renderGraph([
			recordStage("plan", { status: "graded", checkpoint: "recorded" }),
			recordStage("build"),
		]);

		expect(
			within(await graphNode("build")).getByRole("button", {
				name: "Replay build from its checkpoint",
			}),
		).not.toHaveAttribute("aria-disabled");
	});

	it("offers replay of the first stage, which starts from the run's initial checkpoint", async () => {
		renderGraph([recordStage("plan"), recordStage("build")]);

		expect(
			within(await graphNode("plan")).getByRole("button", {
				name: "Replay plan from its checkpoint",
			}),
		).not.toHaveAttribute("aria-disabled");
	});

	it("says on replay why a stage whose predecessor saved no checkpoint cannot be replayed", async () => {
		renderGraph([
			recordStage("plan"),
			recordStage("build", { status: "graded", checkpoint: "recorded" }),
		]);

		expect(
			within(await graphNode("build")).getByRole("button", {
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

	it("says what a step shows when the record holds no minimum grade", async () => {
		renderGraph(
			[recordStage("plan"), recordStage("build")],
			undefined,
			undefined,
			{ state: "unavailable", reasons: ["no stage graded"] },
		);

		const graph = await screen.findByRole("region", { name: "Task graph" });

		expect(graph).toHaveTextContent(PRODUCED_NOTE);
	});

	it("says a step shows what its record says it produced until an analysis gives one agent's reading of its contribution", async () => {
		renderGraph([recordStage("plan"), recordStage("build")]);

		const graph = await screen.findByRole("region", { name: "Task graph" });

		expect(graph).toHaveTextContent(PRODUCED_NOTE);
	});

	describe("when the running stage's latest event is not one of its session's turns", () => {
		it("shows a stage that has only just started as costing nothing yet, not what the stages before it spent", async () => {
			renderMonitor(
				runRow({
					run: RUN,
					stage: "build",
					spend: {
						spentUsd: 1.1,
						spendScope: "the stages finished before this one",
					},
				}),
			);

			expect(await graphNode("build")).toHaveTextContent("$0.00");
		});

		it("shows a stage whose judge is grading as costing its whole session", async () => {
			renderMonitor(
				runRow({
					run: RUN,
					stage: "build",
					stageState: "judge grading",
					spend: { spentUsd: 1.4, spendScope: "this stage's session" },
				}),
			);

			expect(await graphNode("build")).toHaveTextContent("$1.40");
		});

		it("shows a judged stage whose record is not written yet as costing its session and its judge", async () => {
			renderMonitor(
				runRow({
					run: RUN,
					stage: "build",
					stageState: "judged",
					spend: {
						spentUsd: 1.9,
						spendScope: "this stage's session and its judge",
					},
				}),
			);

			expect(await graphNode("build")).toHaveTextContent("$1.90");
		});
	});
});

describe("/monitor stage selection", () => {
	async function paneTitles(): Promise<readonly string[]> {
		const session = await screen.findByRole("region", {
			name: "Live agent session",
		});
		const judge = screen.getByRole("region", { name: "Judge" });

		return [session, judge].map(
			(pane) => within(pane).getByRole("heading", { level: 2 }).textContent,
		);
	}

	it("marks the running stage and names it in the session and judge panes when no stage is selected", async () => {
		renderMonitor(runRow({ run: RUN, stage: "build" }));
		const graph = await screen.findByRole("region", { name: "Task graph" });

		expect(
			within(graph).getByRole("button", { current: "step" }),
		).toHaveTextContent("build");
		expect(await paneTitles()).toEqual(["Step 2 · build", "Judge · step 2"]);
	});

	it("marks a selected stage and names it in the session and judge panes", async () => {
		renderMonitor(runRow({ run: RUN, stage: "build" }));
		const graph = await screen.findByRole("region", { name: "Task graph" });

		fireEvent.click(
			within(graph).getByRole("button", {
				name: /^plan(?! has no checkpoint)/u,
			}),
		);

		expect(
			within(graph).getByRole("button", { current: "step" }),
		).toHaveTextContent("plan");
		expect(await paneTitles()).toEqual(["Step 1 · plan", "Judge · step 1"]);
	});
});

describe("/monitor judge pane", () => {
	const BUILD_JUDGE = `/api/runs/${RUN}/stages/build/judge`;

	function judgePane(): Promise<HTMLElement> {
		return screen.findByRole("region", { name: "Judge" });
	}

	async function rowCells(
		list: string,
	): Promise<readonly (readonly string[])[]> {
		const rows = await within(await judgePane()).findByRole("list", {
			name: list,
		});

		return within(rows)
			.getAllByRole("listitem")
			.map((row) =>
				[...(row.firstElementChild?.children ?? [])].map(
					(cell) => cell.textContent,
				),
			);
	}

	function renderJudge(judge: StageJudge): void {
		renderMonitor(
			runRow({ run: RUN, stage: "build", stageState: "judge grading" }),
			new Map<string, StageJudge>([[BUILD_JUDGE, judge]]),
		);
	}

	describe("while its judge is returning", () => {
		const RETURNING: StageJudge = {
			state: "returning",
			progress: {
				state: "returning",
				attempt: 1,
				sections: {
					hardBlockers: { returned: 2, total: 3 },
					requirements: { returned: 0, total: 1 },
					dimensions: { returned: 1, total: 2 },
				},
				items: {
					hardBlockers: [
						{ id: "no-unrelated-refactors", status: "FAIL" },
						{ id: "tests-pass-before-handoff", status: "PASS" },
						{ id: "no-secrets-in-diff" },
					],
					dimensions: [
						{ id: "scope-discipline", grade: "B" },
						{ id: "diff-hygiene" },
					],
				},
			},
			spentUsd: 0.08,
		};

		it("names the judge grading as an independent session, with what it has cost so far", async () => {
			renderJudge(RETURNING);

			const pane = await judgePane();

			expect(await within(pane).findByText("grading")).toHaveClass(
				"text-accent-foreground",
			);
			expect(pane).toHaveTextContent("independent session · $0.08 so far");
		});

		it("shows the verdict and grade pending while the dimensions return", async () => {
			renderJudge(RETURNING);

			const card = await within(await judgePane()).findByRole("group", {
				name: "Verdict and grade",
			});

			expect(card).toHaveTextContent(
				"Verdict◌pending: dimensions still returning",
			);
			expect(card).toHaveTextContent("Grade—");
		});

		it("lists every hard blocker, each returned one fired or clear and the rest pending, under how many were evaluated", async () => {
			renderJudge(RETURNING);

			expect(await rowCells("Hard blockers")).toEqual([
				["✕", "no-unrelated-refactors", "fired", "evidence pending"],
				["✓", "tests-pass-before-handoff", "clear", "evidence pending"],
				["◌", "no-secrets-in-diff", "pending", "evidence pending"],
			]);
			expect(
				within(await judgePane()).getByRole("heading", {
					level: 3,
					name: /^Hard blockers/u,
				}),
			).toHaveTextContent("Hard blockers · 2 of 3 evaluated");
		});

		it("lists every quality dimension, each returned one with its grade and the rest pending, under how many returned", async () => {
			renderJudge(RETURNING);

			expect(await rowCells("Quality dimensions")).toEqual([
				["scope-discipline", "▮▮▮▮▯", "B", "evidence pending"],
				["diff-hygiene", "▯▯▯▯▯", "—", "evidence pending"],
			]);
			expect(
				within(await judgePane()).getByRole("heading", {
					level: 3,
					name: /^Quality dimensions/u,
				}),
			).toHaveTextContent("Quality dimensions · 1 of 2 returned");
		});

		it("offers no evidence until the judge's record holds it", async () => {
			renderJudge(RETURNING);

			await rowCells("Hard blockers");
			const toggles = within(await judgePane()).getAllByRole("button", {
				name: "evidence pending",
			});

			expect(toggles).toHaveLength(5);
			for (const toggle of toggles) {
				expect(toggle).toHaveAttribute("aria-disabled", "true");
			}
		});

		it("reads the grade as one attempt, linking to the comparisons", async () => {
			renderJudge(RETURNING);

			const note = await within(await judgePane()).findByRole("note");

			expect(note).toHaveTextContent(
				"Read this as one attempt" +
					"Fewer than two identical reruns of this case have graded this step, so how far its grade varies here is not known yet. " +
					"A single grade is a data point, not a score. Compare arms to say whether an edit moved anything.",
			);
			expect(
				within(note).getByRole("link", { name: "Compare arms" }),
			).toHaveAttribute("href", "/comparisons");
		});
		it("says how far identical reruns have graded the step apart", async () => {
			const version = { kind: "version", digest: "a".repeat(64) } as const;
			const rerun = (run: string, letter: string): PipelineRow =>
				runRow({
					run,
					status: "COMPLETED",
					corpusVersion: version,
					grades: [graded("build", letter)],
				});
			const watched = runRow({
				run: RUN,
				stage: "build",
				stageState: "judge grading",
				corpusVersion: version,
			});
			renderMonitor(
				watched,
				new Map<string, unknown>([
					[
						"/api/runs",
						history([
							watched,
							rerun("2026-09-01T10-00-00.000Z", "B"),
							rerun("2026-09-02T10-00-00.000Z", "C"),
						]),
					],
					[BUILD_JUDGE, RETURNING],
				]),
			);

			const note = await within(await judgePane()).findByRole("note");

			await waitFor(() => {
				expect(note).toHaveTextContent(
					"Identical reruns of this case have varied by one letter step here.",
				);
			});
		});
	});

	describe("for a judged stage", () => {
		const PLAN_JUDGE = `/api/runs/${RUN}/stages/plan/judge`;

		const JUDGED: StageJudge = {
			state: "judged",
			hardBlockers: [
				{
					id: "scope-declared-before-edit",
					status: "FAIL",
					evidence: [
						{
							source: "transcript",
							path: "transcript",
							claim: "The agent chose a scope without asking",
							quote: "I'll take the small scope",
							place: "exchange 3 message, characters 0-25",
						},
					],
				},
				{ id: "no-secrets-in-diff", status: "PASS", evidence: [] },
				{ id: "tests-pass-before-handoff", status: "FAIL", evidence: [] },
			],
			dimensions: [
				{
					id: "scope-discipline",
					grade: "C",
					evidence: [
						{
							source: "diff",
							path: "src/a.ts",
							claim: "Names the rule",
							place: "src/a.ts:3-4",
						},
					],
				},
			],
		};

		async function renderJudged(
			grade: MonitoredStage["grade"],
			status: MonitoredStage["status"] = "graded",
		): Promise<void> {
			renderMonitor(
				runRow({ run: RUN, stage: "build" }),
				new Map<string, unknown>([
					[
						`/api/runs/${RUN}`,
						runRecord({
							run: RUN,
							running: "build",
							stages: [
								recordStage("plan", {
									status,
									grade,
									judgeCost: { state: "available", usd: 0.22 },
								}),
								recordStage("build"),
							],
						}),
					],
					[PLAN_JUDGE, JUDGED],
				]),
			);
			fireEvent.click(
				within(await graphNode("plan")).getByRole("button", {
					name: /^plan(?! has no checkpoint)/u,
				}),
			);
		}

		const ACCEPTED_C: MonitoredStage["grade"] = {
			state: "available",
			letter: "C",
			verdict: "CONTINUE",
			reachesMinimum: true,
		};

		it("shows the verdict and grade the run record holds, with the judge's recorded cost", async () => {
			await renderJudged(ACCEPTED_C);

			const pane = await judgePane();
			const card = await within(pane).findByRole("group", {
				name: "Verdict and grade",
			});

			expect(card).toHaveTextContent("Verdict✓accepted: 2 blockers fired");
			expect(card).toHaveTextContent("GradeC");
			expect(pane).toHaveTextContent("independent session · $0.22");
			expect(within(pane).queryByText("grading")).toBeNull();
		});

		it("reads a letter below the run's minimum as stopped, as the stage's node does", async () => {
			await renderJudged({ ...ACCEPTED_C, letter: "D", reachesMinimum: false });

			const card = await within(await judgePane()).findByRole("group", {
				name: "Verdict and grade",
			});

			expect(card).toHaveTextContent("Verdict◼stopped: 2 blockers fired");
		});

		it("keeps the verdict pending until the run record says how the stage ended", async () => {
			await renderJudged(
				{ state: "unavailable", reasons: ["awaiting the judge"] },
				"awaiting-judgment",
			);

			const card = await within(await judgePane()).findByRole("group", {
				name: "Verdict and grade",
			});

			expect(card).toHaveTextContent("Verdict◌pending: grade not recorded yet");
		});

		it("reads the verdict once the run record catches up with the judge, with no run event between", async () => {
			const recordWithPlan = (
				plan: Parameters<typeof recordStage>[1],
			): ReturnType<typeof runRecord> =>
				runRecord({
					run: RUN,
					running: "build",
					stages: [recordStage("plan", plan), recordStage("build")],
				});
			renderMonitor(
				runRow({ run: RUN, stage: "build" }),
				new Map<string, unknown>([
					[`/api/runs/${RUN}`, recordWithPlan({ status: "awaiting-judgment" })],
				]),
			);
			const plan = await graphNode("plan");
			stubFetchByPath(
				new Map<string, unknown>([
					...SHELL_BASELINE,
					...monitorBodies(runRow({ run: RUN, stage: "build" })),
					[
						`/api/runs/${RUN}`,
						recordWithPlan({ status: "graded", grade: ACCEPTED_C }),
					],
					[PLAN_JUDGE, JUDGED],
				]),
			);

			fireEvent.click(
				within(plan).getByRole("button", {
					name: /^plan(?! has no checkpoint)/u,
				}),
			);

			expect(
				await within(await judgePane()).findByText(
					"accepted: 2 blockers fired",
				),
			).toBeInTheDocument();
		});

		it("lists every judged blocker and dimension with how much evidence each cites", async () => {
			await renderJudged(ACCEPTED_C);

			expect(await rowCells("Hard blockers")).toEqual([
				["✕", "scope-declared-before-edit", "fired", "1 cited"],
				["✓", "no-secrets-in-diff", "clear", "no evidence"],
				["✕", "tests-pass-before-handoff", "fired", "no evidence"],
			]);
			expect(await rowCells("Quality dimensions")).toEqual([
				["scope-discipline", "▮▮▮▯▯", "C", "1 cited"],
			]);
			for (const toggle of within(await judgePane()).getAllByRole("button", {
				name: "no evidence",
			})) {
				expect(toggle).toHaveAttribute("aria-disabled", "true");
			}
		});

		it("opens a blocker's evidence with its source, a link to where it is cited, and its quote", async () => {
			await renderJudged(ACCEPTED_C);
			const pane = await judgePane();
			const rows = await within(pane).findByRole("list", {
				name: "Hard blockers",
			});

			fireEvent.click(within(rows).getByRole("button", { name: "1 cited" }));

			const toggle = within(pane).getByRole("button", {
				name: "hide evidence",
			});
			const shown = document.querySelector(
				`#${CSS.escape(toggle.getAttribute("aria-controls") ?? "")}`,
			);
			expect(toggle).toHaveAttribute("aria-expanded", "true");
			expect(rows.children).toHaveLength(3);
			expect(shown).toHaveTextContent(
				"Cited evidencetranscriptexchange 3 message, characters 0-25I'll take the small scope",
			);
			expect(
				within(pane).getByRole("link", {
					name: "exchange 3 message, characters 0-25",
				}),
			).toHaveAttribute(
				"href",
				`/runs/${RUN}/stages/plan/evidence/hardBlockers/scope-declared-before-edit/0`,
			);
		});

		it("opens a dimension's evidence, naming the file a citation without a quote points to", async () => {
			await renderJudged(ACCEPTED_C);
			const rows = await within(await judgePane()).findByRole("list", {
				name: "Quality dimensions",
			});

			fireEvent.click(within(rows).getByRole("button", { name: "1 cited" }));

			expect(
				within(rows).getByRole("link", { name: "src/a.ts:3-4" }),
			).toHaveAttribute(
				"href",
				`/runs/${RUN}/stages/plan/evidence/dimensions/scope-discipline/0`,
			);
			expect(within(rows).queryByRole("blockquote")).toBeNull();
		});

		it("closes evidence it opened", async () => {
			await renderJudged(ACCEPTED_C);
			const pane = await judgePane();
			const rows = await within(pane).findByRole("list", {
				name: "Hard blockers",
			});
			fireEvent.click(within(rows).getByRole("button", { name: "1 cited" }));

			fireEvent.click(
				within(pane).getByRole("button", { name: "hide evidence" }),
			);

			expect(
				within(pane).queryByRole("link", { name: /exchange 3/u }),
			).toBeNull();
		});
	});

	describe("when its judge has returned less than every item", () => {
		function progress(
			hardBlockers: { readonly returned: number; readonly total: number },
			dimensions: { readonly returned: number; readonly total: number },
		): StageJudge {
			return {
				state: "returning",
				progress: {
					state: "returning",
					attempt: 1,
					sections: {
						hardBlockers,
						requirements: { returned: 0, total: 1 },
						dimensions,
					},
				},
			};
		}

		it.each([
			[
				"dimensions still returning",
				progress({ returned: 3, total: 3 }, { returned: 1, total: 2 }),
			],
			[
				"blockers still returning",
				progress({ returned: 1, total: 3 }, { returned: 2, total: 2 }),
			],
			[
				"grade not recorded yet",
				progress({ returned: 3, total: 3 }, { returned: 2, total: 2 }),
			],
			["nothing returned yet", { state: "returning" } as const],
		])("says the verdict is pending: %s", async (words, judge) => {
			renderJudge(judge);

			const card = await within(await judgePane()).findByRole("group", {
				name: "Verdict and grade",
			});

			expect(card).toHaveTextContent(`Verdict◌pending: ${words}`);
		});

		it("shows progress recorded before per-item results as its counts alone", async () => {
			renderJudge(
				progress({ returned: 1, total: 3 }, { returned: 0, total: 2 }),
			);
			const pane = await judgePane();

			const headings = await within(pane).findAllByRole("heading", {
				level: 3,
			});

			expect(headings.map((heading) => heading.textContent)).toEqual([
				"Hard blockers · 1 of 3 evaluated",
				"Quality dimensions · 0 of 2 returned",
			]);
			expect(within(pane).queryByRole("list")).toBeNull();
		});

		it("shows no counts between a rejected attempt and the next one's first reading", async () => {
			renderJudge({ state: "returning", spentUsd: 0.25 });
			const pane = await judgePane();

			await within(pane).findByRole("group", { name: "Verdict and grade" });

			expect(within(pane).queryByRole("heading", { level: 3 })).toBeNull();
			expect(pane).toHaveTextContent("independent session · $0.25 so far");
		});

		it.each([
			["no spend is recorded", undefined],
			["nothing is spent yet", 0],
		])("says the judge's cost is pending while %s", async (_case, spentUsd) => {
			renderJudge({
				...progress({ returned: 0, total: 3 }, { returned: 0, total: 2 }),
				...(spentUsd !== undefined && { spentUsd }),
			});

			const pane = await judgePane();

			await waitFor(() => {
				expect(pane).toHaveTextContent("independent session · cost pending");
			});
		});
	});

	describe("before or without a judged grade", () => {
		it("says the step's judge has not started", async () => {
			renderJudge({ state: "waiting" });

			const pane = await judgePane();

			expect(
				await within(pane).findByText("This step's judge has not started yet."),
			).toBeInTheDocument();
			expect(within(pane).queryByRole("note")).toBeNull();
		});

		it("says a step that ended without a judged grade has no verdict", async () => {
			renderJudge({ state: "not-judged" });

			const pane = await judgePane();

			expect(
				await within(pane).findByText(
					"This step ended without a judged grade, so there is no verdict to show.",
				),
			).toBeInTheDocument();
		});

		it("says when it could not read the step's judge", async () => {
			renderMonitor(runRow({ run: RUN, stage: "build" }));

			const pane = await judgePane();

			expect(await within(pane).findByRole("alert")).toHaveTextContent(
				"Could not read this step's judge.",
			);
		});
	});
});

describe("/monitor session pane", () => {
	const BUILD_SESSION = `/api/runs/${RUN}/stages/build/session`;

	function sessionPane(): Promise<HTMLElement> {
		return screen.findByRole("region", { name: "Live agent session" });
	}

	async function rowCells(): Promise<readonly (readonly string[])[]> {
		const transcript = await within(await sessionPane()).findByRole("list", {
			name: "Transcript",
		});

		return within(transcript)
			.getAllByRole("listitem")
			.map((row) => [...row.children].map((cell) => cell.textContent));
	}

	const RUNNING_SESSION: StageSession = {
		state: "running",
		lineCount: 1284,
		lines: [
			{ line: 1278, kind: "tool", text: "Bash  pnpm test auth" },
			{ line: 1281, kind: "result", text: "44 passed, 0 failed" },
			{ line: 1284, kind: "assistant", text: "Tests pass." },
		],
		latestToolCall: "Bash  pnpm test auth",
	};

	function renderSession(session: StageSession): void {
		renderMonitor(
			runRow({ run: RUN, stage: "build" }),
			new Map<string, StageSession>([[BUILD_SESSION, session]]),
		);
	}

	it("shows the running stage's transcript tail, each row with its line, kind and text", async () => {
		renderSession(RUNNING_SESSION);

		expect(await rowCells()).toEqual([
			["1278", "tool", "Bash  pnpm test auth"],
			["1281", "result", "44 passed, 0 failed"],
			["1284", "assistant", "Tests pass."],
		]);
		expect(await sessionPane()).toHaveTextContent(
			"session running · 1,284 lines",
		);
	});

	describe("following the tail", () => {
		async function sessionBody(): Promise<HTMLElement> {
			const transcript = await within(await sessionPane()).findByRole("list", {
				name: "Transcript",
			});
			const body = transcript.parentElement;
			if (body === null) {
				throw new Error("the transcript sits in no scrolling body");
			}

			return body;
		}

		function press(key: string): void {
			fireEvent.keyDown(document.body, { key });
		}

		it("holds the monitor to the screen's height, so the pane scrolls its own transcript", async () => {
			renderSession(RUNNING_SESSION);

			const body = await sessionBody();
			const graph = await screen.findByRole("region", { name: "Task graph" });

			expect(body).toHaveClass("overflow-y-auto");
			expect(graph.parentElement).toHaveClass("h-full");
		});

		it("follows the tail, counting the tool calls it collapsed, until f unfollows it", async () => {
			renderSession(RUNNING_SESSION);
			const pane = await sessionPane();
			await sessionBody();

			expect(pane).toHaveTextContent(
				"Following tail · j/k to scroll, f to unfollow",
			);
			expect(pane).toHaveTextContent("tool calls collapsed (1)");

			press("f");

			expect(pane).toHaveTextContent(
				"Tail paused · j/k to scroll, f to follow",
			);
		});

		it("toggles the tail once while f is held down", async () => {
			renderSession(RUNNING_SESSION);
			const pane = await sessionPane();
			await sessionBody();

			press("f");
			fireEvent.keyDown(document.body, { key: "f", repeat: true });

			expect(pane).toHaveTextContent("Tail paused");
		});

		it("returns to the tail when f follows it again", async () => {
			renderSession(RUNNING_SESSION);
			const body = await sessionBody();
			Object.defineProperty(body, "scrollHeight", { value: 900 });
			press("f");
			body.scrollTop = 0;

			press("f");

			await waitFor(() => {
				expect(body.scrollTop).toBe(900);
			});
		});

		it("scrolls the pane down with j and up with k", async () => {
			renderSession(RUNNING_SESSION);
			const body = await sessionBody();
			press("f");
			body.scrollTop = 200;

			press("j");
			const down = body.scrollTop;
			press("k");
			press("k");

			expect(down).toBeGreaterThan(200);
			expect(body.scrollTop).toBeLessThan(200);
		});

		it("leaves the tail when k scrolls up from it", async () => {
			renderSession(RUNNING_SESSION);
			const pane = await sessionPane();
			await sessionBody();

			press("k");

			expect(pane).toHaveTextContent(
				"Tail paused · j/k to scroll, f to follow",
			);
		});

		it("ignores f, j and k typed into a field", async () => {
			renderSession(RUNNING_SESSION);
			const pane = await sessionPane();
			const body = await sessionBody();
			const field = document.createElement("input");
			document.body.append(field);
			onTestFinished(() => {
				field.remove();
			});
			body.scrollTop = 200;

			for (const key of ["f", "j", "k"]) {
				fireEvent.keyDown(field, { key });
			}

			expect(pane).toHaveTextContent("Following tail");
			expect(body.scrollTop).toBe(200);
		});

		it("leaves f to the browser when a modifier is held", async () => {
			renderSession(RUNNING_SESSION);
			const pane = await sessionPane();
			await sessionBody();

			fireEvent.keyDown(document.body, { key: "f", metaKey: true });
			fireEvent.keyDown(document.body, { key: "f", ctrlKey: true });
			fireEvent.keyDown(document.body, { key: "f", altKey: true });

			expect(pane).toHaveTextContent("Following tail");
		});

		it("opens the next stage it shows at its tail", async () => {
			renderMonitor(
				runRow({ run: RUN, stage: "build" }),
				new Map<string, unknown>([
					[
						`/api/runs/${RUN}`,
						runRecord({
							run: RUN,
							running: "build",
							stages: [recordStage("plan"), recordStage("build")],
						}),
					],
					[`/api/runs/${RUN}/stages/plan/session`, RUNNING_SESSION],
					[BUILD_SESSION, RUNNING_SESSION],
				]),
			);
			await sessionBody();
			press("f");

			fireEvent.click(
				within(await graphNode("plan")).getByRole("button", {
					name: /^plan(?! has no checkpoint)/u,
				}),
			);

			const pane = await sessionPane();
			await within(pane).findByText(/^Step 1 · plan$/u);
			expect(pane).toHaveTextContent("Following tail");
		});
	});

	describe("for a finished stage", () => {
		const PLAN_SESSION = `/api/runs/${RUN}/stages/plan/session`;
		const TRANSCRIPT_PATH = `.benchmark-runs/${RUN}.checkpoints/plan/transcript.jsonl`;

		function closedBodies(session: StageSession): ReadonlyMap<string, unknown> {
			return new Map<string, unknown>([
				[
					`/api/runs/${RUN}`,
					runRecord({
						run: RUN,
						running: "build",
						stages: [
							recordStage("plan", {
								status: "graded",
								wallTime: { state: "available", ms: 242_000 },
								sessionCost: { state: "available", usd: 1.12 },
							}),
							recordStage("build"),
						],
					}),
				],
				[PLAN_SESSION, session],
			]);
		}

		function renderClosed(session: StageSession): void {
			renderMonitor(
				runRow({ run: RUN, stage: "build" }),
				closedBodies(session),
			);
		}

		async function selectPlan(): Promise<void> {
			fireEvent.click(
				within(await graphNode("plan")).getByRole("button", {
					name: /^plan(?! has no checkpoint)/u,
				}),
			);
		}

		it("shows the spans its judge cites, the session's figures, and its transcript on disk", async () => {
			renderClosed({
				state: "closed",
				lineCount: 1284,
				transcriptPath: TRANSCRIPT_PATH,
				spans: [
					{
						section: "hardBlockers",
						item: "HB-1",
						index: 0,
						claim: "The agent asked before choosing a scope",
						quote: "Which scope?",
						exchange: 1,
						field: "message",
					},
					{
						section: "requirements",
						item: "R1",
						index: 0,
						claim: "The owner answered with the scope",
						quote: "Use the small scope",
						exchange: 1,
						field: "productOwnerAnswer",
					},
					{
						section: "requirements",
						item: "R1",
						index: 1,
						claim: "The owner chose the small scope",
					},
				],
			});

			await selectPlan();

			expect(await rowCells()).toEqual([
				["ex 1", "assistant", "Which scope?"],
				["ex 1", "user", "Use the small scope"],
				["", "cited", "The owner chose the small scope"],
			]);
			const pane = await sessionPane();
			expect(pane).toHaveTextContent(
				"session closed · 1,284 lines · 4m02s · $1.12",
			);
			expect(
				within(pane).getByRole("link", { name: "open session.jsonl" }),
			).toHaveAttribute("href", `/runs/${RUN}/stages/plan`);
			expect(pane).toHaveTextContent(
				"Session ended. The full transcript is on disk; Rehearse keeps only the spans the judge cites.",
			);
			expect(
				within(pane).getByRole("link", {
					name: `.benchmark-runs/${RUN}.checkpoints/plan/transcript.jsonl`,
				}),
			).toHaveAttribute("href", `/runs/${RUN}/stages/plan`);
		});

		it("says when the run kept no copy of the stage's transcript", async () => {
			renderClosed({ state: "closed", spans: [] });

			await selectPlan();

			const pane = await sessionPane();
			expect(
				await within(pane).findByText(
					"Session ended. Rehearse has no copy of its transcript, which it keeps only once the step checkpoints.",
				),
			).toBeInTheDocument();
			expect(
				within(pane).queryByRole("link", { name: "open session.jsonl" }),
			).not.toBeInTheDocument();
		});

		it("shows the transcript's copy once a run event arrives after the step checkpoints", async () => {
			const row = runRow({ run: RUN, stage: "build" });
			renderClosed({ state: "closed", spans: [] });
			await selectPlan();
			const pane = await sessionPane();
			await within(pane).findByText(/^Session ended\./u);
			stubFetchByPath(
				new Map<string, unknown>([
					...SHELL_BASELINE,
					...monitorBodies(row),
					...closedBodies({
						state: "closed",
						spans: [],
						lineCount: 1284,
						transcriptPath: TRANSCRIPT_PATH,
					}),
				]),
			);

			FakeEventSource.openOn(`/api/runs/${RUN}/events`).deliver();

			expect(
				await within(pane).findByRole("link", { name: TRANSCRIPT_PATH }),
			).toBeInTheDocument();
		});
	});

	describe("for a stage not started yet", () => {
		const REVIEW_SESSION = `/api/runs/${RUN}/stages/review/session`;

		function queuedBodies(session: StageSession): ReadonlyMap<string, unknown> {
			return new Map<string, unknown>([
				[
					`/api/runs/${RUN}`,
					runRecord({
						run: RUN,
						running: "build",
						stages: [recordStage("build"), recordStage("review")],
					}),
				],
				[REVIEW_SESSION, session],
			]);
		}

		async function selectReview(): Promise<void> {
			fireEvent.click(
				within(await graphNode("review")).getByRole("button", {
					name: /^review(?! has no checkpoint)/u,
				}),
			);
		}

		it("says the step has not started", async () => {
			renderMonitor(
				runRow({ run: RUN, stage: "build" }),
				queuedBodies({ state: "not-started" }),
			);

			await selectReview();

			expect(
				await within(await sessionPane()).findByText(
					"This step has not started yet.",
				),
			).toBeInTheDocument();
		});

		it("shows the step's tail once a run event arrives after it starts", async () => {
			const row = runRow({ run: RUN, stage: "build" });
			renderMonitor(row, queuedBodies({ state: "not-started" }));
			await selectReview();
			const pane = await sessionPane();
			await within(pane).findByText("This step has not started yet.");
			stubFetchByPath(
				new Map<string, unknown>([
					...SHELL_BASELINE,
					...monitorBodies(row),
					...queuedBodies(RUNNING_SESSION),
				]),
			);

			FakeEventSource.openOn(`/api/runs/${RUN}/events`).deliver();

			expect(await rowCells()).toHaveLength(3);
		});
	});

	it("says a step's transcript cannot be found when its start recorded no session id", async () => {
		renderSession({ state: "untracked" });

		expect(
			await within(await sessionPane()).findByText(
				"This step's session id was not recorded, so its transcript cannot be found.",
			),
		).toBeInTheDocument();
	});

	it("says when it could not read the step's session", async () => {
		renderMonitor(runRow({ run: RUN, stage: "build" }));

		expect(
			await within(await sessionPane()).findByRole("alert"),
		).toHaveTextContent("Could not read this step's session.");
	});

	it("shows the running stage's latest tool call on its node", async () => {
		renderSession(RUNNING_SESSION);

		const build = await graphNode("build");

		expect(
			await within(build).findByText(/^Bash\s+pnpm test auth$/u),
		).toHaveClass("truncate");
	});

	it("shows no tool call on a finished stage's node", async () => {
		renderMonitor(
			runRow({ run: RUN, stage: "build" }),
			new Map<string, unknown>([
				[`/api/runs/${RUN}/stages/plan/session`, RUNNING_SESSION],
				[BUILD_SESSION, RUNNING_SESSION],
			]),
		);

		await within(await graphNode("build")).findByText(
			/^Bash\s+pnpm test auth$/u,
		);

		expect(await graphNode("plan")).not.toHaveTextContent("Bash");
	});
});

describe("/monitor across runs", () => {
	const NEWER = "2026-09-30T11-00-00.000Z";

	function newerRow(): PipelineRow {
		return { ...runRow({ run: NEWER, stage: "build" }), shortId: "r-0149" };
	}

	it("shows the newest run in flight", async () => {
		renderAppWithStub(
			"/monitor",
			new Map<string, unknown>([
				...monitorBodies(runRow({ run: RUN })),
				...monitorBodies(newerRow()),
				["/api/runs", history([runRow({ run: RUN }), newerRow()])],
			]),
		);

		expect(await header()).toHaveTextContent("Run r-0149 in progress");
	});

	it("shows the run in flight its address names, when another is newer", async () => {
		renderAppWithStub(
			`/monitor/${RUN}`,
			new Map<string, unknown>([
				...monitorBodies(runRow({ run: RUN })),
				...monitorBodies(newerRow()),
				["/api/runs", history([runRow({ run: RUN }), newerRow()])],
			]),
		);

		expect(await header()).toHaveTextContent("Run r-0148 in progress");
	});

	it("says the run its address names is not in flight, while another is", async () => {
		const ended: PipelineRow = {
			...runRow({ run: RUN }),
			progress: { state: "recorded" },
		};
		renderAppWithStub(
			`/monitor/${RUN}`,
			new Map<string, unknown>([
				...monitorBodies(newerRow()),
				["/api/runs", history([ended, newerRow()])],
			]),
		);

		const main = within(await screen.findByRole("main"));

		expect(
			await main.findByRole("heading", {
				level: 2,
				name: "This run is not in flight",
			}),
		).toBeInTheDocument();
		expect(main.getByRole("heading", { level: 1 })).toHaveTextContent(
			"Live monitor",
		);
		expect(main.getByText("1 run in flight")).toBeInTheDocument();
	});

	it("names the running stage of the next run, whatever was selected on the one before", async () => {
		renderMonitor(runRow({ run: RUN, stage: "build" }));
		const graph = await screen.findByRole("region", { name: "Task graph" });
		fireEvent.click(
			within(graph).getByRole("button", {
				name: /^plan(?! has no checkpoint)/u,
			}),
		);
		const ended: PipelineRow = {
			...runRow({ run: RUN }),
			progress: { state: "recorded" },
		};
		stubFetchByPath(
			new Map<string, unknown>([
				...SHELL_BASELINE,
				...monitorBodies(newerRow()),
				["/api/runs", history([ended, newerRow()])],
			]),
		);

		FakeEventSource.openOn(`/api/runs/${RUN}/events`).deliver();

		await screen.findByRole("heading", { level: 1, name: /r-0149/u });
		expect(
			within(
				await screen.findByRole("region", { name: "Task graph" }),
			).getByRole("button", { current: "step" }),
		).toHaveTextContent("build");
	});

	it("leaves a run once it ends, as the design draws only runs in flight", async () => {
		renderMonitor(runRow({ run: RUN }));
		await screen.findByRole("region", { name: "Task graph" });
		serveMonitor({ ...runRow({ run: RUN }), progress: { state: "recorded" } });

		FakeEventSource.openOn(`/api/runs/${RUN}/events`).deliver();

		expect(
			await screen.findByRole("heading", {
				level: 2,
				name: "No run in flight",
			}),
		).toBeInTheDocument();
	});

	it("says so when the runs in flight cannot be read", async () => {
		stubFetchFailing("/api/runs");
		renderAppAt("/monitor");

		expect(
			await within(await screen.findByRole("main")).findByRole("alert"),
		).toHaveTextContent("Could not read the runs in flight.");
	});
});

describe("/monitor live updates", () => {
	it("moves the spend band when a run event arrives, without a reload", async () => {
		renderMonitor(runRow({ run: RUN, runSpentUsd: 1.83, ceilingUsd: 20 }));
		const band = await screen.findByRole("region", { name: "Spend" });
		serveMonitor(runRow({ run: RUN, runSpentUsd: 2.4, ceilingUsd: 20 }));

		FakeEventSource.openOn(`/api/runs/${RUN}/events`).deliver();

		expect(await within(band).findByText("$2.40")).toBeInTheDocument();
	});

	it("moves the task graph when a run event arrives, without a reload", async () => {
		const row = runRow({ run: RUN });
		renderMonitor(row);
		const graph = await screen.findByRole("region", { name: "Task graph" });
		stubFetchByPath(
			new Map<string, unknown>([
				...SHELL_BASELINE,
				...monitorBodies(row),
				[
					`/api/runs/${RUN}`,
					runRecord({
						run: RUN,
						running: "build",
						stages: [
							recordStage("plan", {
								status: "graded",
								checkpoint: "recorded",
								checkpointShortId: { state: "available", shortId: "ckpt-s1" },
							}),
							recordStage("build"),
						],
					}),
				],
			]),
		);

		FakeEventSource.openOn(`/api/runs/${RUN}/events`).deliver();

		expect(await within(graph).findByText("ckpt-s1")).toBeInTheDocument();
	});

	it("moves the judge pane when a run event arrives, without a reload", async () => {
		const row = runRow({ run: RUN, stage: "build" });
		const judgeAt = `/api/runs/${RUN}/stages/build/judge`;
		renderMonitor(row, new Map([[judgeAt, { state: "waiting" }]]));
		const pane = await screen.findByRole("region", { name: "Judge" });
		await within(pane).findByText("This step's judge has not started yet.");
		const started: StageJudge = { state: "returning" };
		stubFetchByPath(
			new Map<string, unknown>([
				...SHELL_BASELINE,
				...monitorBodies(row),
				[judgeAt, started],
			]),
		);

		FakeEventSource.openOn(`/api/runs/${RUN}/events`).deliver();

		expect(await within(pane).findByText("grading")).toBeInTheDocument();
	});

	it("reads the run once for events replayed while a read is in flight", async () => {
		renderMonitor(runRow({ run: RUN }));
		await screen.findByRole("region", { name: "Task graph" });
		const answer = globalThis.fetch;
		const reads: string[] = [];
		const counting = (request: string | URL | Request): Promise<Response> => {
			reads.push(request instanceof Request ? request.url : request.toString());
			return answer(request);
		};
		counting.preconnect = fetch.preconnect;
		globalThis.fetch = counting;
		const stream = FakeEventSource.openOn(`/api/runs/${RUN}/events`);

		stream.deliver();
		stream.deliver();
		stream.deliver();

		await waitFor(() => {
			expect(reads.filter((url) => url.endsWith(`/api/runs/${RUN}`))).toEqual([
				`/api/runs/${RUN}`,
			]);
		});
	});

	it("closes the run's event stream once the run is no longer in flight", async () => {
		renderMonitor(runRow({ run: RUN }));
		await screen.findByRole("region", { name: "Spend" });
		const opened = FakeEventSource.openOn(`/api/runs/${RUN}/events`);
		serveMonitor({ ...runRow({ run: RUN }), progress: { state: "recorded" } });

		opened.deliver();

		await waitFor(() => {
			expect(opened.closed).toBe(true);
		});
	});
});

describe("/monitor under reduced motion", () => {
	it("keeps every pulsing glyph static for readers who asked for reduced motion", async () => {
		renderMonitor(runRow({ run: RUN, stage: "build" }));
		const graph = await screen.findByRole("region", { name: "Task graph" });
		const main = graph.closest("main");
		if (main === null) {
			throw new Error("the monitor renders outside the main landmark");
		}

		const pulsing = [...main.querySelectorAll("[class*='animate-live']")];

		expect(pulsing).not.toHaveLength(0);
		for (const glyph of pulsing) {
			expect(glyph).toHaveClass("motion-reduce:animate-none");
		}
	});
});
