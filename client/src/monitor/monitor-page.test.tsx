import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
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

		afterEach(() => {
			setSystemTime();
		});

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
	});
});

describe("/monitor task graph", () => {
	const DIGEST = "a41c7e".padEnd(64, "0");

	function renderGraph(
		stages: readonly ReturnType<typeof recordStage>[],
		runUnder?: CorpusMeasurement,
	): void {
		renderAppWithStub(
			"/monitor",
			new Map<string, unknown>([
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

		expect(await node("build")).toHaveTextContent("bbbbbb");
	});

	it("draws the running stage's pulsing glyph in its status line's colour, as the design does", async () => {
		renderGraph([recordStage("build")]);

		const build = await node("build");
		const glyph = build.querySelector("[class*='animate-live']");

		expect(glyph).not.toBeNull();
		expect(glyph).not.toHaveClass("text-accent-foreground");
	});

	it("draws no hover fill on a node, as the design's node keeps its own background", async () => {
		renderGraph([recordStage("build"), recordStage("review")]);

		const button = within(await node("review")).getAllByRole("button")[0];

		expect(
			[...(button?.classList ?? [])].filter((name) =>
				name.startsWith("hover:"),
			),
		).toEqual([]);
	});

	it("reads a stage not started as having no corpus version", async () => {
		renderGraph([recordStage("build"), recordStage("review")], {
			kind: "version",
			digest: DIGEST,
		});

		expect(await node("review")).toHaveTextContent("version not recorded");
	});

	it("shows a graded stage's letter", async () => {
		renderGraph([
			recordStage("plan", {
				status: "graded",
				grade: { state: "available", letter: "B+", verdict: "PASS" },
			}),
			recordStage("build"),
		]);

		expect(await node("plan")).toHaveTextContent("B+");
	});

	it("reads a stage its judge stopped the run on as stopped", async () => {
		renderGraph([
			recordStage("plan", {
				status: "graded",
				grade: { state: "available", letter: "D", verdict: "STOP" },
			}),
			recordStage("build"),
		]);

		expect(await node("plan")).toHaveTextContent("stopped");
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
								grade: { state: "available", letter: "B+", verdict: "PASS" },
							}),
							recordStage("build"),
						],
					}),
				],
			]),
		);

		const plan = await node("plan");

		expect(plan).toHaveTextContent("✓accepted");
		expect(plan.querySelector("[class*='animate-live']")).toBeNull();
	});

	it("reads a stage waiting on its judge as awaiting judgment", async () => {
		renderGraph([
			recordStage("plan", { status: "awaiting-judgment" }),
			recordStage("build"),
		]);

		expect(await node("plan")).toHaveTextContent("awaiting judgment");
	});

	it("shows a checkpoint recorded before short ids as recorded", async () => {
		renderGraph([
			recordStage("plan", { status: "graded", checkpoint: "recorded" }),
			recordStage("build"),
		]);

		expect(await node("plan")).toHaveTextContent("◆checkpoint recorded");
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

		const shown = await node("plan");

		expect(shown).toHaveTextContent("↓ 3 instruction files in");
		expect(shown).toHaveTextContent("↑ 1 artifact out");
	});

	it("numbers each step in two digits", async () => {
		renderGraph([recordStage("build")]);

		expect(await node("build")).toHaveTextContent(/^01build/u);
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

describe("/monitor session and judge panes", () => {
	it.each([
		[
			"Live agent session",
			"This pane does not show the session's transcript yet.",
		],
		["Judge", "This pane does not show the judge's verdict yet."],
	])(
		"says with the pending glyph what the %s pane does not show yet",
		async (pane, words) => {
			renderMonitor(runRow({ run: RUN }));

			const shown = within(await screen.findByRole("region", { name: pane }));

			expect(shown.getByText(words).parentElement).toHaveTextContent(
				`◌${words}`,
			);
		},
	);
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
