import { afterEach, describe, expect, it } from "bun:test";
import type { RenderResult } from "@testing-library/react";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { InferResponseType } from "hono/client";
import type { apiClient } from "#client/api-client";
import type { Reply } from "#client/test-support/fetch-stub";
import {
	FakeServer,
	stubFetch,
	stubFetchByPath,
} from "#client/test-support/fetch-stub";
import {
	UNREAD_SESSION_ATTEMPT_FIGURES,
	UNREAD_GROUP_FIGURES,
	UNREAD_REPLAY_FIGURES,
	UNREAD_RUN_FIGURES,
	UNREAD_STALENESS,
	unversionedStaleness,
} from "#client/test-support/run-figures";
import type { GroupStageSummary } from "#server/confirmation-group-summary";
import { SESSION_GRADE_REASON } from "#server/session-grade-reason";
import type {
	ConfirmationGroupRow,
	ListedStageGrade,
	PipelineRunRow,
	ReplayRow,
	RowStaleness,
	SessionAttemptRow,
} from "#server/run-history";
import { RunHistoryPage } from "./run-history-page";

type RunHistoryResponseBody = InferResponseType<typeof apiClient.api.runs.$get>;

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function respondingWith(body: RunHistoryResponseBody): void {
	stubFetch(body);
}

/**
 * Returns the render result so a test can scope its queries to the tree it
 * just mounted. `screen` searches the whole document, which a test asserting
 * the *absence* of a reading cannot rely on: a slow sibling test's tree may
 * still be mounted when it runs.
 */
function renderPage(): RenderResult {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});

	const root = createRootRoute({ component: RunHistoryPage });
	const router = createRouter({
		routeTree: root.addChildren([
			createRoute({ getParentRoute: () => root, path: "/cases" }),
		]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});

	return render(
		<QueryClientProvider client={client}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
}

function oneStoppedOneComplete(): RunHistoryResponseBody {
	return {
		rows: [
			{
				kind: "run",
				...UNREAD_RUN_FIGURES,
				launchId: undefined,
				shortId: undefined,
				checkpoints: [],
				links: [],
				run: "2026-09-06T21-58-29.508Z",
				caseId: "audit-log",
				status: "STOPPED:build",
				stage: "shape",
				grade: "B",
				corpusVersion: { kind: "version", digest: "a3a62f" },
				corpusChangedDuringRun: false,
				staleness: unversionedStaleness({ stale: true, causes: [] }),
				progress: { state: "recorded" },
			},
			{
				kind: "run",
				...UNREAD_RUN_FIGURES,
				launchId: undefined,
				shortId: undefined,
				checkpoints: [],
				links: [],
				run: "2026-09-03T00-00-00.000Z",
				caseId: "audit-log",
				status: "COMPLETE",
				stage: "build",
				grade: "A",
				corpusVersion: { kind: "version", digest: "b1c2d3" },
				corpusChangedDuringRun: false,
				staleness: unversionedStaleness({ stale: false, causes: [] }),
				progress: { state: "recorded" },
			},
		],
		launches: [],
		unreadable: [],
	};
}

function cellOf(run: string, column: string): HTMLElement {
	const headers = screen
		.getAllByRole("columnheader")
		.map((header) => header.textContent);
	const cell = screen
		.getByText(run)
		.closest("tr")
		?.children.item(headers.indexOf(column));

	if (!(cell instanceof HTMLElement)) {
		throw new Error(`No ${column} cell for ${run}`);
	}

	return cell;
}

describe(RunHistoryPage.name, () => {
	it("renders the empty-state block when no runs are recorded", async () => {
		respondingWith({ rows: [], launches: [], unreadable: [] });

		renderPage();

		await waitFor(() => {
			expect(screen.getByText("No runs recorded")).toBeInTheDocument();
		});
	});

	/**
	 * The corpus state that used to fail `/api/runs` outright, which this screen
	 * could only render as its query error: the refusal now arrives as a row's
	 * staleness cause, so the history reads and the corpus screen is where the
	 * operator learns which file broke.
	 */
	it("renders the history, not the query error, when the corpus refuses its instruction file", async () => {
		respondingWith({
			rows: [
				{
					kind: "run",
					...UNREAD_RUN_FIGURES,
					launchId: undefined,
					shortId: undefined,
					checkpoints: [],
					links: [],
					run: "2026-09-06T21-58-29.508Z",
					caseId: "audit-log",
					status: "COMPLETE",
					stage: "build",
					grade: "B",
					corpusVersion: { kind: "version", digest: "a3a62f" },
					corpusChangedDuringRun: false,
					staleness: unversionedStaleness({
						stale: true,
						causes: [
							"Corpus file CLAUDE.md resolves outside the corpus source, which would hash bytes the corpus does not hold",
						],
					}),
					progress: { state: "recorded" },
				},
			],
			launches: [],
			unreadable: [],
		});

		renderPage();

		await waitFor(() => {
			expect(screen.getByText("2026-09-06T21-58-29.508Z")).toBeInTheDocument();
		});
		expect(screen.getByText("stale")).toBeInTheDocument();
		expect(
			screen.queryByText("Could not load run history."),
		).not.toBeInTheDocument();
	});

	it("says the history could not load when the server refuses it with an error body", async () => {
		new FakeServer(
			new Map([
				[
					"GET /api/runs",
					{
						status: 409,
						body: {
							error: "The linked corpus directory <path> is no longer a corpus",
						},
					},
				],
			]),
		).install();

		renderPage();

		expect(
			await screen.findByText("Could not load run history."),
		).toBeInTheDocument();
	});

	it("renders a row for every recorded run, status and corpus as design-system components", async () => {
		respondingWith({
			rows: [
				{
					kind: "run",
					...UNREAD_RUN_FIGURES,
					launchId: undefined,
					shortId: undefined,
					checkpoints: [],
					links: [],
					run: "2026-09-06T21-58-29.508Z",
					caseId: "audit-log",
					status: "STOPPED:build",
					stage: "shape",
					grade: "B",
					corpusVersion: { kind: "version", digest: "a3a62f" },
					corpusChangedDuringRun: false,
					staleness: unversionedStaleness({
						stale: true,
						causes: ["CLAUDE.md changed"],
					}),
					progress: { state: "recorded" },
				},
			],
			launches: [],
			unreadable: [],
		});

		renderPage();

		await waitFor(() => {
			expect(screen.getByText("2026-09-06T21-58-29.508Z")).toBeInTheDocument();
		});
		expect(screen.getByText("audit-log")).toBeInTheDocument();
		expect(cellOf("2026-09-06T21-58-29.508Z", "Outcome")).toHaveTextContent(
			"stopped at build",
		);
		expect(screen.getByText("corpus@a3a62f")).toBeInTheDocument();
		expect(screen.getByText("stale")).toBeInTheDocument();
	});

	it("links a stopped run to the stage it stopped on, not its last checkpoint", async () => {
		respondingWith(oneStoppedOneComplete());

		const page = renderPage();

		expect(await page.findByRole("link", { name: /build/u })).toHaveAttribute(
			"href",
			"/runs/2026-09-06T21-58-29.508Z/stages/build",
		);
	});

	it("leaves an outcome that is not a stop as text, linking nowhere", async () => {
		respondingWith(oneStoppedOneComplete());

		await renderPage().findByText("2026-09-03T00-00-00.000Z");

		const outcome = cellOf("2026-09-03T00-00-00.000Z", "Outcome");
		expect(outcome).toHaveTextContent("completed");
		expect(within(outcome).queryByRole("link")).not.toBeInTheDocument();
	});

	it("links a pipeline run's id to its run detail", async () => {
		respondingWith(oneStoppedOneComplete());

		const page = renderPage();

		expect(
			await page.findByRole("link", { name: "2026-09-06T21-58-29.508Z" }),
		).toHaveAttribute("href", "/runs/2026-09-06T21-58-29.508Z");
	});

	it("names the records table once, so the caption is not doubled by a heading", async () => {
		respondingWith({
			rows: [
				{
					kind: "run",
					...UNREAD_RUN_FIGURES,
					launchId: undefined,
					shortId: undefined,
					checkpoints: [],
					links: [],
					run: "2026-09-06T21-58-29.508Z",
					caseId: "audit-log",
					status: "STOPPED:build",
					stage: "shape",
					grade: "B",
					corpusVersion: { kind: "version", digest: "a3a62f" },
					corpusChangedDuringRun: false,
					staleness: unversionedStaleness({
						stale: true,
						causes: ["CLAUDE.md changed"],
					}),
					progress: { state: "recorded" },
				},
			],
			launches: [],
			unreadable: [],
		});

		renderPage();

		await waitFor(() => {
			expect(screen.getByRole("table")).toHaveAccessibleName("DURABLE RECORDS");
		});
		expect(screen.getAllByText("DURABLE RECORDS")).toHaveLength(1);
	});

	it("renders a filter bar built from FilterPill, all pressed by default", async () => {
		respondingWith({ rows: [], launches: [], unreadable: [] });

		renderPage();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /All/u })).toBeInTheDocument();
		});
		expect(screen.getByRole("button", { name: /All/u })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});

	it("names how many records are on disk", async () => {
		respondingWith(oneStoppedOneComplete());

		renderPage();

		expect(await screen.findByText(/^2 records on disk/u)).toBeInTheDocument();
	});

	it("keeps counting every record on the All pill while Stopped narrows the table", async () => {
		respondingWith(oneStoppedOneComplete());
		renderPage();
		await screen.findByText("2026-09-03T00-00-00.000Z");

		fireEvent.click(screen.getByRole("button", { name: "Stopped" }));

		expect(screen.getByRole("button", { name: "All 2" })).toBeInTheDocument();
	});

	it("narrows the table to stopped runs when the Stopped filter is pressed", async () => {
		respondingWith(oneStoppedOneComplete());

		renderPage();

		await waitFor(() => {
			expect(screen.getByText("2026-09-06T21-58-29.508Z")).toBeInTheDocument();
		});
		expect(screen.getByText("2026-09-03T00-00-00.000Z")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Stopped" }));

		expect(screen.getByText("2026-09-06T21-58-29.508Z")).toBeInTheDocument();
		expect(
			screen.queryByText("2026-09-03T00-00-00.000Z"),
		).not.toBeInTheDocument();
	});

	describe("the corpus column's judgment of a record against the corpus under test", () => {
		function corpusFileEdit(
			versions: number,
		): Extract<RowStaleness, { readonly state: "available" }> {
			return {
				state: "available",
				stale: true,
				causes: ["skills/build/SKILL.md changed"],
				changedFiles: [{ path: "skills/build/SKILL.md", change: "changed" }],
				onlyCorpusFiles: true,
				distance: { kind: "measured", versions },
				readManifest: [],
			};
		}

		function historyOf(
			rows: readonly {
				readonly name: string;
				readonly staleness: RowStaleness;
			}[],
		): RunHistoryResponseBody {
			return {
				rows: rows.map(({ name, staleness }) => ({
					kind: "replay",
					staleness,
					corpusVersion: undefined,
					...UNREAD_REPLAY_FIGURES,
					shortId: undefined,
					checkpointShortId: undefined,
					attempt: undefined,
					lineage: "60758c",
					timestamp: name,
					caseId: "audit-log",
					stage: "build",
					grade: "B",
					status: "CONTINUE",
					links: [],
				})),
				launches: [],
				unreadable: [],
			};
		}

		it.each([
			[
				"clean at the version under test",
				{
					state: "available",
					stale: false,
					causes: [],
					changedFiles: [],
					onlyCorpusFiles: false,
					distance: { kind: "measured", versions: 0 },
					readManifest: [],
				} satisfies RowStaleness,
				"✓clean",
			],
			[
				"stale one version back when only a file it read changed",
				corpusFileEdit(1),
				"⚠stale · corpus changed since",
			],
			[
				"superseded two or more versions back when only files it read changed",
				corpusFileEdit(3),
				"⚠superseded · 3 versions back",
			],
			[
				"superseded from exactly two versions back",
				corpusFileEdit(2),
				"⚠superseded · 2 versions back",
			],
			[
				"stale one version back when its upstream stage went stale from the same file edit",
				{
					...corpusFileEdit(1),
					causes: [
						"skills/build/SKILL.md changed",
						"upstream stage shape is stale",
					],
				},
				"⚠stale · corpus changed since",
			],
			[
				"stale, not clean, at the version under test when a setting changed",
				{
					state: "available",
					stale: true,
					causes: ["model sonnet is now opus"],
					changedFiles: [],
					onlyCorpusFiles: false,
					distance: { kind: "measured", versions: 0 },
					readManifest: [],
				} satisfies RowStaleness,
				"⚠stale",
			],
		])("reads %s", async (_scenario, staleness, reading) => {
			respondingWith(
				historyOf([{ name: "2026-09-06T00-00-00.000Z", staleness }]),
			);

			renderPage();

			await waitFor(() => {
				expect(cellOf("2026-09-06T00-00-00.000Z", "Corpus")).toHaveTextContent(
					reading,
				);
			});
		});

		it("keeps the stale badge and names the cause when something besides a corpus file made the record stale", async () => {
			respondingWith(
				historyOf([
					{
						name: "2026-09-06T00-00-00.000Z",
						staleness: {
							...corpusFileEdit(1),
							causes: ["model sonnet is now opus"],
							changedFiles: [],
							onlyCorpusFiles: false,
						},
					},
				]),
			);

			renderPage();

			await waitFor(() => {
				expect(
					screen.getByText("model sonnet is now opus"),
				).toBeInTheDocument();
			});
			expect(cellOf("2026-09-06T00-00-00.000Z", "Corpus")).toHaveTextContent(
				"⚠stale",
			);
			expect(
				cellOf("2026-09-06T00-00-00.000Z", "Corpus"),
			).not.toHaveTextContent("corpus changed since");
		});

		it("keeps the plain stale badge when a settings file changed alongside a corpus file", async () => {
			respondingWith(
				historyOf([
					{
						name: "2026-09-06T00-00-00.000Z",
						staleness: {
							...corpusFileEdit(1),
							causes: [
								"skills/build/SKILL.md changed",
								"settings.json changed",
							],
							onlyCorpusFiles: false,
						},
					},
				]),
			);

			renderPage();

			await waitFor(() => {
				expect(cellOf("2026-09-06T00-00-00.000Z", "Corpus")).toHaveTextContent(
					"⚠stale",
				);
			});
			expect(
				cellOf("2026-09-06T00-00-00.000Z", "Corpus"),
			).not.toHaveTextContent("corpus changed since");
		});

		it("says why a record's staleness could not be judged", async () => {
			respondingWith(
				historyOf([
					{
						name: "2026-09-06T00-00-00.000Z",
						staleness: {
							state: "unavailable",
							reasons: [
								"the group froze no pipeline to hash its stages against",
							],
						},
					},
				]),
			);

			renderPage();

			await waitFor(() => {
				expect(
					screen.getByText(
						"the group froze no pipeline to hash its stages against",
					),
				).toBeInTheDocument();
			});
		});
	});

	it("names the cause when a row is stale for one reason", async () => {
		respondingWith({
			rows: [
				{
					kind: "run",
					...UNREAD_RUN_FIGURES,
					launchId: undefined,
					shortId: undefined,
					checkpoints: [],
					links: [],
					run: "2026-09-06T21-58-29.508Z",
					caseId: "audit-log",
					status: "STOPPED:build",
					stage: "shape",
					grade: "B",
					corpusVersion: { kind: "version", digest: "a3a62f" },
					corpusChangedDuringRun: false,
					staleness: unversionedStaleness({
						stale: true,
						causes: ["CLAUDE.md changed"],
					}),
					progress: { state: "recorded" },
				},
			],
			launches: [],
			unreadable: [],
		});

		renderPage();

		await waitFor(() => {
			expect(screen.getByText("CLAUDE.md changed")).toBeInTheDocument();
		});
	});

	describe("when a row is stale for more than one reason", () => {
		const twoCauseRow: RunHistoryResponseBody = {
			rows: [
				{
					kind: "run",
					...UNREAD_RUN_FIGURES,
					launchId: undefined,
					shortId: undefined,
					checkpoints: [],
					links: [],
					run: "2026-09-06T21-58-29.508Z",
					caseId: "audit-log",
					status: "STOPPED:build",
					stage: "shape",
					grade: "B",
					corpusVersion: { kind: "version", digest: "a3a62f" },
					corpusChangedDuringRun: false,
					staleness: unversionedStaleness({
						stale: true,
						causes: ["CLAUDE.md changed", "agents/advisor.md added"],
					}),
					progress: { state: "recorded" },
				},
			],
			launches: [],
			unreadable: [],
		};

		it("counts the causes rather than listing them, and keeps them collapsed", async () => {
			respondingWith(twoCauseRow);

			renderPage();

			await waitFor(() => {
				expect(
					screen.getByRole("button", { name: "2 causes" }),
				).toHaveAttribute("aria-expanded", "false");
			});
			expect(screen.queryByText("CLAUDE.md changed")).not.toBeInTheDocument();
		});

		it("expands every cause in place when the count is pressed", async () => {
			respondingWith(twoCauseRow);

			renderPage();

			await waitFor(() => {
				expect(
					screen.getByRole("button", { name: "2 causes" }),
				).toBeInTheDocument();
			});
			fireEvent.click(screen.getByRole("button", { name: "2 causes" }));

			expect(screen.getByText("CLAUDE.md changed")).toBeInTheDocument();
			expect(screen.getByText("agents/advisor.md added")).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "hide causes" }),
			).toHaveAttribute("aria-expanded", "true");
		});

		it("does not carry one row's expanded causes onto another when the filter changes the rows", async () => {
			respondingWith({
				rows: [
					{
						kind: "run",
						...UNREAD_RUN_FIGURES,
						launchId: undefined,
						shortId: undefined,
						checkpoints: [],
						links: [],
						run: "2026-09-06T00-00-00.000Z",
						caseId: "audit-log",
						status: "COMPLETE",
						stage: "build",
						grade: "A",
						corpusVersion: { kind: "version", digest: "aaaaaa" },
						corpusChangedDuringRun: false,
						staleness: unversionedStaleness({
							stale: true,
							causes: ["CLAUDE.md changed", "agents/advisor.md added"],
						}),
						progress: { state: "recorded" },
					},
					{
						kind: "run",
						...UNREAD_RUN_FIGURES,
						launchId: undefined,
						shortId: undefined,
						checkpoints: [],
						links: [],
						run: "2026-09-05T00-00-00.000Z",
						caseId: "audit-log",
						status: "STOPPED:build",
						stage: "build",
						grade: "B",
						corpusVersion: { kind: "version", digest: "bbbbbb" },
						corpusChangedDuringRun: false,
						staleness: unversionedStaleness({
							stale: true,
							causes: [
								"output-styles/brief.md changed",
								"rulebook/coupling.md added",
								"rulebook/ownership.md changed",
							],
						}),
						progress: { state: "recorded" },
					},
				],
				launches: [],
				unreadable: [],
			});

			renderPage();

			await waitFor(() => {
				expect(
					screen.getByRole("button", { name: "2 causes" }),
				).toBeInTheDocument();
			});
			fireEvent.click(screen.getByRole("button", { name: "2 causes" }));
			fireEvent.click(screen.getByRole("button", { name: "Stopped" }));

			expect(screen.getByRole("button", { name: "3 causes" })).toHaveAttribute(
				"aria-expanded",
				"false",
			);
			expect(
				screen.queryByText("output-styles/brief.md changed"),
			).not.toBeInTheDocument();
		});
	});

	describe("when a run is in flight", () => {
		const RUNNING_RUN = "2026-09-07T00-00-00.000Z";

		/**
		 * Measured when the test reads it, so the elapsed reading does not
		 * depend on how long the tests before it took.
		 */
		function runningRow(): Extract<
			RunHistoryResponseBody["rows"][number],
			{ readonly kind: "run" }
		> {
			return {
				kind: "run",
				...UNREAD_RUN_FIGURES,
				launchId: undefined,
				shortId: undefined,
				checkpoints: [],
				links: [],
				run: RUNNING_RUN,
				caseId: "audit-log",
				status: "RUNNING",
				stage: undefined,
				grade: undefined,
				corpusVersion: undefined,
				corpusChangedDuringRun: false,
				staleness: unversionedStaleness({ stale: false, causes: [] }),
				stageGrades: {
					state: "available",
					grades: ["shape", "build", "review"].map((stage) => ({
						stage,
						status: "no-record",
						grade: { state: "unavailable", reasons: ["not graded yet"] },
					})),
				},
				progress: liveProgress(),
			};
		}

		function liveProgress(): Extract<
			PipelineRunRow["progress"],
			{ readonly state: "running" }
		> {
			return {
				state: "running",
				stage: "build",
				stageState: "session running",
				elapsedMs: 9000,
				stageElapsedMs: undefined,
				measuredAt: new Date().toISOString(),
				spentUsd: 0.9,
				spendScope: "this stage's session so far",
				runSpentUsd: 1.2,
				runTokens: undefined,
				ceilingUsd: undefined,
			};
		}

		it("lists the running run beside the finished ones, marked running", async () => {
			respondingWith({ rows: [runningRow()], launches: [], unreadable: [] });

			renderPage();

			await waitFor(() => {
				expect(
					screen.getByText("2026-09-07T00-00-00.000Z"),
				).toBeInTheDocument();
			});
			expect(cellOf(RUNNING_RUN, "Outcome")).toHaveTextContent("running");
		});

		it("names the step it is in, its place in the pipeline and that step's state as its outcome", async () => {
			respondingWith({ rows: [runningRow()], launches: [], unreadable: [] });

			await renderPage().findByText(RUNNING_RUN);

			expect(cellOf(RUNNING_RUN, "Outcome")).toHaveTextContent(
				"running · step 2 of 3build · session running",
			);
		});

		it("reads what the run has spent so far as its cost", async () => {
			respondingWith({ rows: [runningRow()], launches: [], unreadable: [] });

			await renderPage().findByText(RUNNING_RUN);

			expect(cellOf(RUNNING_RUN, "Cost").textContent).toBe("$1.20so far");
		});

		it("reads how long the run has gone as its wall time", async () => {
			respondingWith({ rows: [runningRow()], launches: [], unreadable: [] });

			await renderPage().findByText(RUNNING_RUN);

			expect(cellOf(RUNNING_RUN, "Wall").textContent).toBe("00:09");
		});

		it("has no Progress column, since the outcome, cost and wall cells carry it", async () => {
			respondingWith({ rows: [runningRow()], launches: [], unreadable: [] });

			await renderPage().findByText(RUNNING_RUN);

			expect(
				screen.getAllByRole("columnheader").map((header) => header.textContent),
			).not.toContain("Progress");
		});

		/**
		 * The number alone would be read as the run's total, which it is not:
		 * every event kind scopes its spend differently, and one scoped to a
		 * single stage falls when the next stage begins.
		 */
		it("says what the spend figure covers where the run's own spend is not recorded", async () => {
			respondingWith({
				rows: [
					{
						...runningRow(),
						progress: { ...liveProgress(), runSpentUsd: undefined },
					},
				],
				launches: [],
				unreadable: [],
			});

			await renderPage().findByText(RUNNING_RUN);

			expect(cellOf(RUNNING_RUN, "Cost").textContent).toBe(
				"$0.90this stage's session so far",
			);
		});

		/**
		 * Scoped to the cell rather than the document: the page's own empty-state
		 * copy says "a spend limit is set", so a document-wide search for that
		 * word would fail for a reason that has nothing to do with the row.
		 */
		it("shows no spend ceiling or limit beside the figure", async () => {
			respondingWith({ rows: [runningRow()], launches: [], unreadable: [] });

			await renderPage().findByText(RUNNING_RUN);

			const cost = within(cellOf(RUNNING_RUN, "Cost"));
			expect(cost.queryByText(/\/\s*\$/u)).not.toBeInTheDocument();
			expect(
				cost.queryByText(/limit|ceiling|budget/iu),
			).not.toBeInTheDocument();
		});

		/**
		 * The one thing this screen exists to do while a run is going. The
		 * operator is watching a row, not reloading a page, so a reading that
		 * only moves on refresh is the same as no reading at all.
		 */
		it("moves the step, wall time and cost with no page reload", async () => {
			const bodies: RunHistoryResponseBody[] = [
				{ rows: [runningRow()], launches: [], unreadable: [] },
				{
					rows: [
						{
							...runningRow(),
							progress: {
								...liveProgress(),
								stage: "review",
								elapsedMs: 74_000,
								measuredAt: new Date().toISOString(),
								runSpentUsd: 2.5,
							},
						},
					],
					launches: [],
					unreadable: [],
				},
			];
			const stub = (): Promise<Response> =>
				Promise.resolve(Response.json(bodies.shift()));
			stub.preconnect = fetch.preconnect;
			globalThis.fetch = stub;

			await renderPage().findByText(RUNNING_RUN);

			await waitFor(
				() => {
					expect(cellOf(RUNNING_RUN, "Outcome")).toHaveTextContent(
						"running · step 3 of 3review · session running",
					);
				},
				{ timeout: 5000 },
			);
			expect(cellOf(RUNNING_RUN, "Wall").textContent).toMatch(/^01:1[4-9]$/u);
			expect(cellOf(RUNNING_RUN, "Cost").textContent).toBe("$2.50so far");
		});

		it("advances the wall time every second", async () => {
			respondingWith({ rows: [runningRow()], launches: [], unreadable: [] });

			await renderPage().findByText(RUNNING_RUN);

			await waitFor(
				() => {
					expect(cellOf(RUNNING_RUN, "Wall").textContent).toBe("00:10");
				},
				{ timeout: 2500 },
			);
		});

		/**
		 * A run reports its elapsed time once per agent turn, minutes apart, so a
		 * row showing only the recorded figure would sit frozen between turns
		 * while the run is plainly still going.
		 */
		it("carries the wall time forward from the run's last measurement", async () => {
			respondingWith({
				rows: [
					{
						...runningRow(),
						progress: {
							...liveProgress(),
							measuredAt: new Date(Date.now() - 52_000).toISOString(),
						},
					},
				],
				launches: [],
				unreadable: [],
			});

			await renderPage().findByText(RUNNING_RUN);

			expect(cellOf(RUNNING_RUN, "Wall").textContent).toBe("01:01");
		});

		it("re-reads the list no faster than the idle pace once no run is in flight", async () => {
			let requests = 0;
			const stub = (): Promise<Response> => {
				requests += 1;

				return Promise.resolve(
					Response.json({
						rows: [{ ...runningRow(), progress: { state: "recorded" } }],
						launches: [],
						unreadable: [],
					}),
				);
			};
			stub.preconnect = fetch.preconnect;
			globalThis.fetch = stub;

			renderPage();

			await waitFor(() => {
				expect(
					screen.getByText("2026-09-07T00-00-00.000Z"),
				).toBeInTheDocument();
			});
			const afterFirstRender = requests;
			await Bun.sleep(2500);

			expect(requests).toBe(afterFirstRender);
		});

		it("reads no running spend or elapsed time for a finished run", async () => {
			respondingWith({
				rows: [
					{
						kind: "run",
						...UNREAD_RUN_FIGURES,
						launchId: undefined,
						shortId: undefined,
						checkpoints: [],
						links: [],
						run: "2026-09-06T00-00-00.000Z",
						caseId: "audit-log",
						status: "COMPLETE",
						stage: "build",
						grade: "A",
						corpusVersion: { kind: "version", digest: "aaaaaa" },
						corpusChangedDuringRun: false,
						staleness: unversionedStaleness({ stale: false, causes: [] }),
						progress: { state: "recorded" },
					},
				],
				launches: [],
				unreadable: [],
			});

			renderPage();

			await waitFor(() => {
				expect(
					screen.getByText("2026-09-06T00-00-00.000Z"),
				).toBeInTheDocument();
			});
			expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
			expect(screen.queryByText("0s")).not.toBeInTheDocument();
		});
		describe("when the operator ends it", () => {
			const LAUNCH_ID = "7b0c2d4e-0000-4000-8000-000000000000";
			const RUN = "2026-09-07T00-00-00.000Z";

			function serving(
				body: RunHistoryResponseBody,
				replies: ReadonlyMap<string, Reply> = new Map(),
			): FakeServer {
				const server = new FakeServer(
					new Map([["GET /api/runs", { status: 200, body }], ...replies]),
				);
				server.install();

				return server;
			}

			it("stops a run the browser launched through its launch", async () => {
				const server = serving({
					rows: [{ ...runningRow(), launchId: LAUNCH_ID }],
					launches: [],
					unreadable: [],
				});
				renderPage();

				fireEvent.click(
					await screen.findByRole("button", { name: "Stop & restore repo" }),
				);

				await waitFor(() => {
					expect(server.posted(`/api/launches/${LAUNCH_ID}/stop`)).toHaveLength(
						1,
					);
				});
			});

			/**
			 * The request guard refuses a write without a JSON content type, so a
			 * bodiless post would never reach the route.
			 */
			it.each([
				["Stop & restore repo", `/api/launches/${LAUNCH_ID}/stop`],
				["Pause after this step", `/api/runs/${RUN}/pause`],
			])(
				"sends %s as JSON so the request guard admits it",
				async (name, path) => {
					const server = serving({
						rows: [{ ...runningRow(), launchId: LAUNCH_ID }],
						launches: [],
						unreadable: [],
					});
					renderPage();

					fireEvent.click(await screen.findByRole("button", { name }));

					await waitFor(() => {
						expect(server.posted(path)[0]?.contentType).toBe(
							"application/json",
						);
					});
				},
			);

			it("asks the run to pause after the step it is running", async () => {
				const server = serving({
					rows: [runningRow()],
					launches: [],
					unreadable: [],
				});
				renderPage();

				fireEvent.click(
					await screen.findByRole("button", { name: "Pause after this step" }),
				);

				await waitFor(() => {
					expect(server.posted(`/api/runs/${RUN}/pause`)).toHaveLength(1);
				});
			});

			it("stops a launch that has no record yet", async () => {
				const server = serving({
					rows: [],
					launches: [
						{
							kind: "launch",
							id: LAUNCH_ID,
							target: "case",
							caseId: "audit-log",
							run: undefined,
							stage: undefined,
							attempts: 3,
							launchedAt: new Date().toISOString(),
							status: "RUNNING",
						},
					],
					unreadable: [],
				});
				renderPage();

				fireEvent.click(
					await screen.findByRole("button", { name: "Stop & restore repo" }),
				);

				await waitFor(() => {
					expect(server.posted(`/api/launches/${LAUNCH_ID}/stop`)).toHaveLength(
						1,
					);
				});
			});

			it("shows the server's refusal", async () => {
				serving(
					{ rows: [runningRow()], launches: [], unreadable: [] },
					new Map([
						[
							`POST /api/runs/${RUN}/pause`,
							{ status: 409, body: { error: `Run ${RUN} is not running` } },
						],
					]),
				);
				renderPage();

				fireEvent.click(
					await screen.findByRole("button", { name: "Pause after this step" }),
				);

				expect(await screen.findByRole("alert")).toHaveTextContent(
					`Run ${RUN} is not running`,
				);
			});

			it("marks the server's refusal with the warning glyph", async () => {
				serving(
					{ rows: [runningRow()], launches: [], unreadable: [] },
					new Map([
						[
							`POST /api/runs/${RUN}/pause`,
							{ status: 409, body: { error: `Run ${RUN} is not running` } },
						],
					]),
				);
				renderPage();

				fireEvent.click(
					await screen.findByRole("button", { name: "Pause after this step" }),
				);

				const refusal = await screen.findByRole("alert");

				expect(refusal).toHaveTextContent(/^⚠/u);
				expect(refusal).toHaveClass("text-11-5");
			});

			describe("when the browser did not launch it", () => {
				it("offers no stop, since only the terminal that started it can signal it", async () => {
					serving({ rows: [runningRow()], launches: [], unreadable: [] });
					const { findByRole, queryByRole } = renderPage();

					await findByRole("button", { name: "Pause after this step" });

					expect(
						queryByRole("button", { name: "Stop & restore repo" }),
					).not.toBeInTheDocument();
				});
			});
		});
	});

	it("shows the badge and the cause in the corpus cell for a stale row that recorded no checkpoint stage, with no pill", async () => {
		respondingWith({
			rows: [
				{
					kind: "run",
					...UNREAD_RUN_FIGURES,
					launchId: undefined,
					shortId: undefined,
					checkpoints: [],
					links: [],
					run: "2026-09-05T00-00-00.000Z",
					caseId: "audit-log",
					status: "INTERRUPTED",
					stage: undefined,
					grade: undefined,
					corpusVersion: undefined,
					corpusChangedDuringRun: false,
					staleness: unversionedStaleness({
						stale: true,
						causes: ["upstream stage initial is stale"],
					}),
					progress: { state: "recorded" },
				},
			],
			launches: [],
			unreadable: [],
		});

		renderPage();

		await waitFor(() => {
			expect(screen.getByText("stale")).toBeInTheDocument();
		});
		expect(
			screen.getByText("upstream stage initial is stale"),
		).toBeInTheDocument();
		expect(screen.queryByText(/^corpus@/u)).not.toBeInTheDocument();
		expect(cellOf("2026-09-05T00-00-00.000Z", "Corpus")).not.toHaveTextContent(
			"—",
		);
	});

	describe("when the report can carry unreadable runs", () => {
		const unreadableReport: RunHistoryResponseBody = {
			rows: [
				{
					kind: "run",
					...UNREAD_RUN_FIGURES,
					launchId: undefined,
					shortId: undefined,
					checkpoints: [],
					links: [],
					run: "2026-09-06T21-58-29.508Z",
					caseId: "audit-log",
					status: "COMPLETE",
					stage: "build",
					grade: "B",
					corpusVersion: { kind: "version", digest: "a3a62f" },
					corpusChangedDuringRun: false,
					staleness: unversionedStaleness({ stale: false, causes: [] }),
					progress: { state: "recorded" },
				},
			],
			launches: [],
			unreadable: [
				{
					kind: "run",
					id: "run:2026-09-01T00-00-00.000Z",
					reason: "manifest.json is empty",
				},
				{
					kind: "run",
					id: "run:2026-09-02T00-00-00.000Z",
					reason: "artifact.json is empty",
				},
			],
		};

		it("names them as records, counted by kind, whatever kinds they are", async () => {
			respondingWith({
				...unreadableReport,
				launches: [],
				unreadable: [
					...unreadableReport.unreadable,
					{
						kind: "group",
						id: "group:g-1",
						reason: "incomplete: no group.json recorded",
					},
					{
						kind: "group",
						id: "group:g-2",
						reason: "incomplete: no group.json recorded",
					},
					{
						kind: "replay",
						id: "attempt:stage:lineage-build/2026-09-03T01-00-00.000Z",
						reason: "replay record is empty",
					},
					{
						kind: "session-attempt",
						id: "attempt:session:smoke/0f6b",
						reason: "incomplete: no attempt.json recorded",
					},
				],
			});

			renderPage();

			const alert = await screen.findByRole("alert");

			expect(alert).toHaveTextContent("These records could not be read");
			expect(alert).not.toHaveTextContent("These runs");
			expect(alert).toHaveTextContent("2 runs");
			expect(alert).toHaveTextContent("2 confirmation runs");
			expect(alert).toHaveTextContent("1 session attempt");
			expect(alert).toHaveTextContent("1 replay");
			expect(alert).not.toHaveTextContent("group:g-1");
		});

		it("names an unreadable short id registry among them", async () => {
			respondingWith({
				...unreadableReport,
				launches: [],
				unreadable: [
					...unreadableReport.unreadable,
					{
						kind: "short-ids",
						id: "short-ids",
						reason: "Directories cannot be read like files",
					},
				],
			});

			renderPage();

			expect(await screen.findByRole("alert")).toHaveTextContent(
				"1 short id registry",
			);
		});

		it.each([
			{ kind: "run", expected: "2 runs" },
			{ kind: "session-attempt", expected: "2 session attempts" },
			{ kind: "replay", expected: "2 replays" },
			{ kind: "group", expected: "2 confirmation runs" },
			{ kind: "launch", expected: "2 launches" },
			{ kind: "short-ids", expected: "2 short id registries" },
		] as const)(
			"counts two unreadable records of kind $kind as $expected",
			async ({ kind, expected }) => {
				respondingWith({
					...unreadableReport,
					launches: [],
					unreadable: [
						{ kind, id: `${kind}-first`, reason: "unreadable" },
						{ kind, id: `${kind}-second`, reason: "unreadable" },
					],
				});

				renderPage();

				expect(await screen.findByRole("alert")).toHaveTextContent(expected);
			},
		);

		it("names every unreadable record by id and reason once the list is opened", async () => {
			respondingWith(unreadableReport);

			renderPage();

			const alert = await screen.findByRole("alert");
			fireEvent.click(within(alert).getByRole("button", { name: "show 2" }));

			expect(alert).toHaveTextContent("run:2026-09-01T00-00-00.000Z");
			expect(alert).toHaveTextContent("manifest.json is empty");
			expect(alert).toHaveTextContent("run:2026-09-02T00-00-00.000Z");
			expect(alert).toHaveTextContent("artifact.json is empty");
		});

		it("keeps the alert when the status filter hides every row", async () => {
			respondingWith(unreadableReport);

			renderPage();

			await screen.findByRole("alert");
			fireEvent.click(screen.getByRole("button", { name: "Stopped" }));

			expect(screen.getByRole("alert")).toHaveTextContent("2 runs");
		});

		it("shows the unreadable runs rather than the empty state when the report has no rows at all", async () => {
			respondingWith({
				rows: [],
				launches: [],
				unreadable: unreadableReport.unreadable,
			});

			renderPage();

			await screen.findByRole("alert");

			expect(screen.queryByText("No runs recorded")).not.toBeInTheDocument();
		});

		it("keeps the empty state when rows exist, the filter hides them, and nothing was unreadable", async () => {
			respondingWith({ ...unreadableReport, launches: [], unreadable: [] });

			renderPage();

			await waitFor(() => {
				expect(screen.getByText("audit-log")).toBeInTheDocument();
			});
			fireEvent.click(screen.getByRole("button", { name: "Stopped" }));

			expect(screen.getByText("No runs recorded")).toBeInTheDocument();
		});

		it("keeps the empty state when the filter hides every row and unreadable runs are also present", async () => {
			respondingWith(unreadableReport);

			renderPage();

			await waitFor(() => {
				expect(screen.getByText("audit-log")).toBeInTheDocument();
			});
			fireEvent.click(screen.getByRole("button", { name: "Stopped" }));

			expect(screen.getByText("No runs recorded")).toBeInTheDocument();
		});
	});

	describe("when the report lists every kind of saved record", () => {
		const everyKind: RunHistoryResponseBody = {
			rows: [
				{
					kind: "run",
					...UNREAD_RUN_FIGURES,
					launchId: undefined,
					shortId: undefined,
					checkpoints: [],
					run: "2026-09-06T21-58-29.508Z",
					caseId: "audit-log",
					status: "STOPPED:build",
					stage: "shape",
					grade: "B",
					corpusVersion: { kind: "version", digest: "a3a62f" },
					corpusChangedDuringRun: false,
					staleness: unversionedStaleness({ stale: false, causes: [] }),
					progress: { state: "recorded" },
					links: [
						{
							state: "available",
							label: "shape",
							href: "/runs/2026-09-06T21-58-29.508Z/stages/shape",
						},
					],
				},
				{
					kind: "run",
					...UNREAD_RUN_FIGURES,
					launchId: undefined,
					shortId: undefined,
					checkpoints: [],
					run: "2026-09-17T12-50-49.127Z",
					caseId: undefined,
					status: "FAILED",
					stage: undefined,
					grade: undefined,
					corpusVersion: undefined,
					corpusChangedDuringRun: false,
					staleness: unversionedStaleness({ stale: false, causes: [] }),
					progress: { state: "recorded" },
					links: [
						{
							state: "unavailable",
							label: "shape",
							reason: "failed before saving its context",
						},
					],
				},
				{
					kind: "replay",
					staleness: UNREAD_STALENESS,
					corpusVersion: undefined,
					...UNREAD_REPLAY_FIGURES,
					shortId: undefined,
					checkpointShortId: undefined,
					attempt: undefined,
					lineage: "60758c",
					timestamp: "2026-09-06T22-33-15.057Z",
					caseId: "audit-log",
					stage: "shape",
					grade: "F",
					status: "STOP",
					links: [
						{
							state: "available",
							label: "context",
							href: "/replays/60758c/2026-09-06T22-33-15.057Z",
						},
					],
				},
				{
					kind: "session-attempt",
					staleness: UNREAD_STALENESS,
					corpusVersion: undefined,
					...UNREAD_SESSION_ATTEMPT_FIGURES,
					shortId: undefined,
					caseId: "brief-reply",
					uuid: "0f6b6f2a-0000-4000-8000-000000000001",
					status: "UNSUCCESSFUL",
					links: [
						{
							state: "available",
							label: "context",
							href: "/attempts/session/brief-reply/0f6b6f2a-0000-4000-8000-000000000001",
						},
					],
				},
				{
					kind: "group",
					staleness: UNREAD_STALENESS,
					corpusVersion: undefined,
					checkpoint: undefined,
					...UNREAD_GROUP_FIGURES,
					shortId: undefined,
					groupId: "group-a",
					caseId: "brief-reply",
					mode: "session",
					reps: 2,
					repAttempts: [],
					links: [
						{
							state: "available",
							label: "rep 1",
							href: "/groups/group-a/reps/group-a-rep-1/attempt",
						},
						{
							state: "unavailable",
							label: "rep 2",
							reason: "no attempt recorded for group-a-rep-2",
						},
					],
				},
			],
			launches: [],
			unreadable: [],
		};

		it.each([
			["replay", "2026-09-06T22-33-15.057Z"],
			["session attempt", "0f6b6f2a-0000-4000-8000-000000000001"],
		])("leaves a %s's own identity unlinked", async (_kind, identity) => {
			respondingWith(everyKind);

			await renderPage().findByText("group-a");

			expect(
				within(cellOf(identity, "Run")).queryByRole("link"),
			).not.toBeInTheDocument();
		});

		it.each([
			["replay", "2026-09-06T22-33-15.057Z", "STOP"],
			[
				"session attempt",
				"0f6b6f2a-0000-4000-8000-000000000001",
				"unsuccessful",
			],
			["pipeline run", "2026-09-17T12-50-49.127Z", "interrupted"],
		])("shows a %s's outcome", async (_kind, identity, outcome) => {
			respondingWith(everyKind);

			await renderPage().findByText("group-a");

			expect(cellOf(identity, "Outcome")).toHaveTextContent(outcome);
		});

		it("names on every kind of row the corpus version its record measured, the refusal, or that none was recorded", async () => {
			const measured = {
				replay: { kind: "refused", refusal: "a symlink escapes the root" },
				"session-attempt": { kind: "version", digest: "c".repeat(64) },
				group: { kind: "version", digest: "d".repeat(64) },
			} as const;
			respondingWith({
				...everyKind,
				rows: everyKind.rows.map((row) =>
					row.kind === "run"
						? row
						: { ...row, corpusVersion: measured[row.kind] },
				),
			});

			await renderPage().findByText("group-a");

			expect(cellOf("2026-09-17T12-50-49.127Z", "Corpus")).toHaveTextContent(
				"version not recorded",
			);
			expect(cellOf("2026-09-06T22-33-15.057Z", "Corpus")).toHaveTextContent(
				"refused: a symlink escapes the root",
			);
			expect(
				cellOf("0f6b6f2a-0000-4000-8000-000000000001", "Corpus"),
			).toHaveTextContent("corpus@cccccc");
			expect(cellOf("group-a", "Corpus")).toHaveTextContent("corpus@dddddd");
		});

		it("opens each available context from a link in the case cell, named by what it opens", async () => {
			respondingWith(everyKind);

			await renderPage().findByText("group-a");

			for (const [identity, name, href] of [
				[
					"2026-09-06T21-58-29.508Z",
					"shape",
					"/runs/2026-09-06T21-58-29.508Z/stages/shape",
				],
				[
					"2026-09-06T22-33-15.057Z",
					"context",
					"/replays/60758c/2026-09-06T22-33-15.057Z",
				],
				[
					"0f6b6f2a-0000-4000-8000-000000000001",
					"context",
					"/attempts/session/brief-reply/0f6b6f2a-0000-4000-8000-000000000001",
				],
				["group-a", "rep 1", "/groups/group-a/reps/group-a-rep-1/attempt"],
			] as const) {
				expect(
					within(cellOf(identity, "Case")).getByRole("link", { name }),
				).toHaveAttribute("href", href);
			}
		});

		it("names what cannot be opened and why, as text rather than a link", async () => {
			respondingWith(everyKind);

			await renderPage().findByText("group-a");

			const failed = cellOf("2026-09-17T12-50-49.127Z", "Case");
			expect(failed).toHaveTextContent("case not recorded");
			expect(failed).toHaveTextContent(
				"shape · failed before saving its context",
			);
			expect(within(failed).queryByRole("link")).not.toBeInTheDocument();
			const group = cellOf("group-a", "Case");
			expect(group).toHaveTextContent(
				"rep 2 · no attempt recorded for group-a-rep-2",
			);
			expect(
				within(group).queryByRole("link", { name: /rep 2/u }),
			).not.toBeInTheDocument();
		});

		it("names a replay no short id names by its stage alone", async () => {
			respondingWith(everyKind);

			await renderPage().findByText("group-a");

			expect(cellOf("2026-09-06T22-33-15.057Z", "Case")).toHaveTextContent(
				/replay · shape(?! ·)/u,
			);
		});

		it("says a record's time is not recorded where its record holds none", async () => {
			respondingWith(everyKind);

			await renderPage().findByText("group-a");

			expect(
				cellOf("0f6b6f2a-0000-4000-8000-000000000001", "Case"),
			).toHaveTextContent("time not recorded");
			expect(cellOf("group-a", "Case")).toHaveTextContent("time not recorded");
			expect(cellOf("2026-09-06T22-33-15.057Z", "Case")).not.toHaveTextContent(
				"time not recorded",
			);
		});

		it("counts every listed record on the All pill and the subline", async () => {
			respondingWith(everyKind);

			renderPage();

			expect(
				await screen.findByRole("button", { name: "All 5" }),
			).toBeInTheDocument();
			expect(
				screen.getByText(
					/^5 records on disk · every pipeline run names the corpus version/u,
				),
			).toBeInTheDocument();
		});

		it("keeps Stopped meaning a pipeline run with a stopped stage, so a STOP verdict does not match", async () => {
			respondingWith(everyKind);
			await renderPage().findByText("group-a");

			fireEvent.click(screen.getByRole("button", { name: "Stopped" }));

			expect(screen.getByText("2026-09-06T21-58-29.508Z")).toBeInTheDocument();
			for (const identity of [
				"2026-09-17T12-50-49.127Z",
				"2026-09-06T22-33-15.057Z",
				"0f6b6f2a-0000-4000-8000-000000000001",
				"group-a",
			]) {
				expect(screen.queryByText(identity)).not.toBeInTheDocument();
			}
		});
	});

	describe("when records carry short ids", () => {
		const named: RunHistoryResponseBody = {
			rows: [
				{
					kind: "run",
					...UNREAD_RUN_FIGURES,
					launchId: undefined,
					shortId: "audit-log/r7",
					checkpoints: [{ stage: "initial", shortId: "audit-log/r7/s0" }],
					links: [],
					run: "2026-09-07T00-00-00.000Z",
					caseId: "audit-log",
					status: "RUNNING",
					stage: undefined,
					grade: undefined,
					corpusVersion: undefined,
					corpusChangedDuringRun: false,
					staleness: unversionedStaleness({ stale: false, causes: [] }),
					progress: {
						state: "running",
						stage: "build",
						stageState: "session running",
						elapsedMs: 9000,
						stageElapsedMs: undefined,
						measuredAt: new Date().toISOString(),
						spentUsd: 0.9,
						spendScope: "this stage's session so far",
						runSpentUsd: undefined,
						runTokens: undefined,
						ceilingUsd: undefined,
					},
				},
				{
					kind: "replay",
					staleness: UNREAD_STALENESS,
					corpusVersion: undefined,
					...UNREAD_REPLAY_FIGURES,
					shortId: "audit-log/r6",
					checkpointShortId: "audit-log/r2/s1",
					attempt: { position: 2, count: 3 },
					lineage: "60758c",
					timestamp: "2026-09-06T22-33-15.057Z",
					caseId: "audit-log",
					stage: "build",
					grade: "A",
					status: "CONTINUE",
					links: [],
				},
				{
					kind: "group",
					staleness: UNREAD_STALENESS,
					corpusVersion: undefined,
					checkpoint: undefined,
					...UNREAD_GROUP_FIGURES,
					shortId: "brief-reply/g4",
					groupId: "group-a",
					caseId: "brief-reply",
					mode: "session",
					reps: 2,
					repAttempts: [],
					links: [],
				},
			],
			launches: [],
			unreadable: [],
		};

		it("names each record by its short id, with the identity it is filed under beneath", async () => {
			respondingWith(named);

			await renderPage().findByText("group-a");

			for (const [identity, shortId] of [
				["2026-09-07T00-00-00.000Z", "audit-log/r7"],
				["2026-09-06T22-33-15.057Z", "audit-log/r6"],
				["group-a", "brief-reply/g4"],
			] as const) {
				expect(cellOf(identity, "Run")).toHaveTextContent(
					`${shortId}${identity}`,
				);
			}
		});

		it("links a pipeline run's short id to its run detail", async () => {
			respondingWith(named);

			const page = renderPage();

			expect(
				await page.findByRole("link", { name: "audit-log/r7" }),
			).toHaveAttribute("href", "/runs/2026-09-07T00-00-00.000Z");
		});

		it.each([
			["replay", "2026-09-06T22-33-15.057Z"],
			["confirmation run", "group-a"],
		])(
			"leaves a %s's id unlinked, since only a pipeline run has a run detail",
			async (_kind, identity) => {
				respondingWith(named);

				await renderPage().findByText("group-a");

				expect(
					within(cellOf(identity, "Run")).queryByRole("link"),
				).not.toBeInTheDocument();
			},
		);

		it("names the checkpoint a replay started from and which attempt there it is", async () => {
			respondingWith(named);

			await renderPage().findByText("group-a");

			expect(cellOf("2026-09-06T22-33-15.057Z", "Case")).toHaveTextContent(
				"replay · build · from audit-log/r2/s1 · attempt 2 of 3",
			);
		});
	});

	it("says the corpus changed during a run whose stages measured different versions", async () => {
		const [first] = oneStoppedOneComplete().rows;
		respondingWith({
			rows:
				first?.kind === "run"
					? [{ ...first, corpusChangedDuringRun: true }]
					: [],
			launches: [],
			unreadable: [],
		});

		await renderPage().findByText("2026-09-06T21-58-29.508Z");

		expect(cellOf("2026-09-06T21-58-29.508Z", "Corpus")).toHaveTextContent(
			"corpus@a3a62f",
		);
		expect(cellOf("2026-09-06T21-58-29.508Z", "Corpus")).toHaveTextContent(
			"corpus changed during the run",
		);
	});

	it("renders a run with no recorded checkpoint as recording no corpus version", async () => {
		respondingWith({
			rows: [
				{
					kind: "run",
					...UNREAD_RUN_FIGURES,
					launchId: undefined,
					shortId: undefined,
					checkpoints: [],
					links: [],
					run: "2026-09-05T00-00-00.000Z",
					caseId: "audit-log",
					status: "STOPPED:discuss",
					stage: undefined,
					grade: undefined,
					corpusVersion: undefined,
					corpusChangedDuringRun: false,
					staleness: unversionedStaleness({ stale: false, causes: [] }),
					progress: { state: "recorded" },
				},
			],
			launches: [],
			unreadable: [],
		});

		renderPage();

		await waitFor(() => {
			expect(screen.getByText("2026-09-05T00-00-00.000Z")).toBeInTheDocument();
		});
		expect(screen.queryByText(/^corpus@/u)).not.toBeInTheDocument();
		expect(cellOf("2026-09-05T00-00-00.000Z", "Corpus")).toHaveTextContent(
			"version not recorded",
		);
	});

	describe("when a launch from the browser has not recorded anything yet", () => {
		const launchedAt = "2026-09-29T10:00:00.000Z";

		it("lists a started case as running, above the records", async () => {
			respondingWith({
				rows: [],
				launches: [
					{
						kind: "launch",
						id: "7b0c2d4e-0000-4000-8000-000000000000",
						target: "case",
						caseId: "audit-log",
						run: undefined,
						stage: undefined,
						attempts: 3,
						launchedAt,
						status: "RUNNING",
					},
				],
				unreadable: [],
			});

			renderPage();

			await waitFor(() => {
				expect(screen.getByText("launch 7b0c2d4e")).toBeInTheDocument();
			});
			expect(cellOf("launch 7b0c2d4e", "Case")).toHaveTextContent("audit-log");
			expect(cellOf("launch 7b0c2d4e", "Case")).toHaveTextContent(
				"group · 3 attempts",
			);
			expect(cellOf("launch 7b0c2d4e", "Outcome")).toHaveTextContent("running");
			expect(screen.queryByText("No runs recorded")).not.toBeInTheDocument();
		});

		it.each(["Step grades", "Task grade"])(
			"leaves its %s cell empty, since it has no record to grade",
			async (column) => {
				respondingWith({
					rows: [],
					launches: [
						{
							kind: "launch",
							id: "7b0c2d4e-0000-4000-8000-000000000000",
							target: "case",
							caseId: "audit-log",
							run: undefined,
							stage: undefined,
							attempts: 1,
							launchedAt,
							status: "RUNNING",
						},
					],
					unreadable: [],
				});

				await renderPage().findByText("launch 7b0c2d4e");

				expect(cellOf("launch 7b0c2d4e", column).textContent).toBe("");
			},
		);

		it("names the stage and run a started replay replays", async () => {
			respondingWith({
				rows: [],
				launches: [
					{
						kind: "launch",
						id: "9c1d3e5f-0000-4000-8000-000000000000",
						target: "replay",
						caseId: undefined,
						run: "2026-09-06T21-58-29.508Z",
						stage: "build",
						attempts: 1,
						launchedAt,
						status: "RUNNING",
					},
				],
				unreadable: [],
			});

			renderPage();

			await waitFor(() => {
				expect(screen.getByText("launch 9c1d3e5f")).toBeInTheDocument();
			});
			expect(cellOf("launch 9c1d3e5f", "Case")).toHaveTextContent(
				"replay build · 2026-09-06T21-58-29.508Z",
			);
		});

		it("names the checkpoint a started comparison replays its baseline at", async () => {
			respondingWith({
				rows: [],
				launches: [
					{
						kind: "launch",
						id: "4a2b6c8d-0000-4000-8000-000000000000",
						target: "comparison",
						caseId: undefined,
						run: "2026-09-06T21-58-29.508Z",
						stage: "build",
						attempts: 2,
						launchedAt,
						status: "RUNNING",
					},
				],
				unreadable: [],
			});

			renderPage();

			await waitFor(() => {
				expect(screen.getByText("launch 4a2b6c8d")).toBeInTheDocument();
			});
			expect(cellOf("launch 4a2b6c8d", "Case")).toHaveTextContent(
				"compare attempts at build · 2026-09-06T21-58-29.508Z",
			);
		});

		it("names the checkpoint a started extension adds attempts at", async () => {
			respondingWith({
				rows: [],
				launches: [
					{
						kind: "launch",
						id: "5e3f7a9b-0000-4000-8000-000000000000",
						target: "extension",
						caseId: undefined,
						run: "2026-09-06T21-58-29.508Z",
						stage: "build",
						attempts: 2,
						launchedAt,
						status: "RUNNING",
					},
				],
				unreadable: [],
			});

			renderPage();

			await waitFor(() => {
				expect(screen.getByText("launch 5e3f7a9b")).toBeInTheDocument();
			});
			expect(cellOf("launch 5e3f7a9b", "Case")).toHaveTextContent(
				"add attempts to a comparison at build · 2026-09-06T21-58-29.508Z",
			);
		});

		it("names the run a started root-cause analysis reads, as one call it cannot stop", async () => {
			respondingWith({
				rows: [],
				launches: [
					{
						kind: "launch",
						id: "6c4d8e0f-0000-4000-8000-000000000000",
						target: "analysis",
						caseId: undefined,
						run: "2026-09-06T21-58-29.508Z",
						stage: undefined,
						attempts: 1,
						launchedAt,
						status: "RUNNING",
					},
				],
				unreadable: [],
			});

			const { queryByRole } = renderPage();

			await waitFor(() => {
				expect(screen.getByText("launch 6c4d8e0f")).toBeInTheDocument();
			});
			const target = cellOf("launch 6c4d8e0f", "Case");
			expect(target).toHaveTextContent(
				"root-cause analysis of 2026-09-06T21-58-29.508Z",
			);
			expect(target).toHaveTextContent("one call");
			expect(target).not.toHaveTextContent("one run");
			expect(
				queryByRole("button", { name: "Stop & restore repo" }),
			).not.toBeInTheDocument();
		});

		it("lists a launch the operator stopped as stopped, with no controls", async () => {
			respondingWith({
				rows: [],
				launches: [
					{
						kind: "launch",
						id: "7b0c2d4e-0000-4000-8000-000000000000",
						target: "case",
						caseId: "audit-log",
						run: undefined,
						stage: undefined,
						attempts: 3,
						launchedAt,
						status: "OPERATOR_STOPPED",
					},
				],
				unreadable: [],
			});

			const { queryByRole } = renderPage();

			await waitFor(() => {
				expect(screen.getByText("launch 7b0c2d4e")).toBeInTheDocument();
			});
			const outcome = cellOf("launch 7b0c2d4e", "Outcome");
			expect(outcome).toHaveTextContent("stopped by the operator");
			expect(outcome).not.toHaveTextContent("running");
			expect(
				queryByRole("button", { name: "Stop & restore repo" }),
			).not.toBeInTheDocument();
		});
	});

	it("opens the launch dialog from New run", async () => {
		stubFetchByPath(
			new Map([["/api/runs", { rows: [], launches: [], unreadable: [] }]]),
		);
		renderPage();

		fireEvent.click(await screen.findByRole("button", { name: "New run" }));

		expect(
			await screen.findByRole("dialog", { name: "Start a run" }),
		).toBeInTheDocument();
	});

	describe("the step grades and task grade of a pipeline run", () => {
		const RUN = "2026-09-20T10-00-00.000Z";

		function graded(stage: string, letter: string): ListedStageGrade {
			return {
				stage,
				status: "graded",
				grade: {
					state: "available",
					letter,
					verdict: "CONTINUE",
					reachesMinimum: true,
				},
			};
		}

		function ungraded(
			stage: string,
			status: ListedStageGrade["status"],
		): ListedStageGrade {
			return {
				stage,
				status,
				grade: { state: "unavailable", reasons: ["no grade recorded"] },
			};
		}

		function runWith(
			figures: Pick<PipelineRunRow, "stageGrades" | "finalOutcome">,
		): RunHistoryResponseBody {
			return {
				rows: [
					{
						kind: "run",
						...UNREAD_RUN_FIGURES,
						...figures,
						launchId: undefined,
						shortId: undefined,
						checkpoints: [],
						links: [],
						run: RUN,
						caseId: "audit-log",
						status: "COMPLETE",
						stage: "review",
						grade: undefined,
						corpusVersion: undefined,
						corpusChangedDuringRun: false,
						staleness: UNREAD_STALENESS,
						progress: { state: "recorded" },
					},
				],
				launches: [],
				unreadable: [],
			};
		}

		it("reads one token per stage in pipeline order, a letter where graded and · where not", async () => {
			respondingWith(
				runWith({
					...UNREAD_RUN_FIGURES,
					stageGrades: {
						state: "available",
						grades: [
							graded("shape", "A−"),
							graded("plan", "B+"),
							{ ...graded("build", "D"), status: "stopped" },
							ungraded("review", "not-run"),
						],
					},
				}),
			);

			await renderPage().findByText(RUN);

			expect(cellOf(RUN, "Step grades").textContent).toBe("A− B+ D ·");
		});

		it("says why its step grades could not be read", async () => {
			respondingWith(
				runWith({
					...UNREAD_RUN_FIGURES,
					stageGrades: {
						state: "unavailable",
						reasons: ["the run wrote no manifest, which names its stages"],
					},
				}),
			);

			await renderPage().findByText(RUN);

			expect(cellOf(RUN, "Step grades")).toHaveTextContent(
				"the run wrote no manifest, which names its stages",
			);
		});

		it.each([
			[
				"the final judge's passing verdict",
				{ state: "available", status: "JUDGED", verdict: "PASS" },
				"PASSgraded independently",
			],
			[
				"the final judge's failing verdict",
				{ state: "available", status: "JUDGED", verdict: "FAIL" },
				"FAILgraded independently",
			],
			[
				"a dash while the run is pending",
				{ state: "available", status: "PENDING", stage: "build" },
				"—pending · the run is at build",
			],
			[
				"a dash with why the final judge was not reached",
				{
					state: "available",
					status: "NOT_REACHED",
					stage: "build",
					reason: "the run stopped at build",
				},
				"—not reached · the run stopped at build",
			],
			[
				"a dash with why judging failed",
				{
					state: "available",
					status: "JUDGING_FAILED",
					reason: "the judge returned no verdict",
				},
				"—judging failed · the judge returned no verdict",
			],
			[
				"a dash with why the outcome could not be read",
				{ state: "unavailable", reasons: ["the artifact does not parse"] },
				"—the artifact does not parse",
			],
		] as const)(
			"reads as its task grade %s",
			async (_reading, finalOutcome, text) => {
				respondingWith(runWith({ ...UNREAD_RUN_FIGURES, finalOutcome }));

				await renderPage().findByText(RUN);

				expect(cellOf(RUN, "Task grade").textContent).toBe(text);
			},
		);
	});

	describe("the step grades and task grade of a replay", () => {
		const REPLAY = "2026-09-21T09-20-00.000Z";

		function replayWith(
			pipelineStages: ReplayRow["pipelineStages"],
		): RunHistoryResponseBody {
			return {
				rows: [
					{
						kind: "replay",
						...UNREAD_REPLAY_FIGURES,
						pipelineStages,
						staleness: UNREAD_STALENESS,
						corpusVersion: undefined,
						shortId: undefined,
						checkpointShortId: undefined,
						attempt: undefined,
						lineage: "60758c",
						timestamp: REPLAY,
						caseId: "audit-log",
						stage: "build",
						grade: "B+",
						status: "CONTINUE",
						links: [],
					},
				],
				launches: [],
				unreadable: [],
			};
		}

		it("places the replayed stage's letter at its position among its pipeline's stages", async () => {
			respondingWith(
				replayWith({
					state: "available",
					stages: ["shape", "plan", "build", "review"],
				}),
			);

			await renderPage().findByText(REPLAY);

			expect(cellOf(REPLAY, "Step grades").textContent).toBe("· · B+ ·");
		});

		it("shows the letter with why its pipeline's stages could not be read", async () => {
			respondingWith(
				replayWith({
					state: "unavailable",
					reasons: ["the source run's manifest is not recorded"],
				}),
			);

			await renderPage().findByText(REPLAY);

			expect(cellOf(REPLAY, "Step grades")).toHaveTextContent(
				"B+the source run's manifest is not recorded",
			);
		});

		it("reads n/a as its task grade, since it replays one step", async () => {
			respondingWith(replayWith({ state: "available", stages: ["build"] }));

			await renderPage().findByText(REPLAY);

			expect(cellOf(REPLAY, "Task grade")).toHaveTextContent(
				"n/astep replay only",
			);
		});
	});

	describe("the step grades and task grade of a confirmation group", () => {
		const GROUP = "group-0143";

		function summary(
			stage: string,
			median: "A" | "B" | undefined,
			graded: number,
		): GroupStageSummary {
			return {
				stage,
				graded,
				ungraded: {},
				grades:
					median === undefined
						? {
								state: "unavailable",
								reasons: ["no rep was graded at this stage"],
							}
						: { state: "available", median, lowest: "C", highest: "A" },
			};
		}

		type GroupFigures = Pick<
			ConfirmationGroupRow,
			| "mode"
			| "reps"
			| "pipelineStages"
			| "stageSummaries"
			| "finalOutcomes"
			| "successful"
		>;

		function groupWith(figures: GroupFigures): RunHistoryResponseBody {
			return {
				rows: [
					{
						kind: "group",
						...UNREAD_GROUP_FIGURES,
						...figures,
						staleness: UNREAD_STALENESS,
						corpusVersion: undefined,
						checkpoint: undefined,
						shortId: undefined,
						groupId: GROUP,
						caseId: "audit-log",
						repAttempts: [],
						links: [],
					},
				],
				launches: [],
				unreadable: [],
			};
		}

		describe("in pipeline mode", () => {
			const pipelineFigures: GroupFigures = {
				mode: "pipeline",
				reps: 6,
				pipelineStages: {
					state: "available",
					stages: ["shape", "build", "review"],
				},
				stageSummaries: [
					summary("shape", "A", 6),
					summary("build", "B", 5),
					summary("review", undefined, 0),
				],
				finalOutcomes: { PASS: 4, FAIL: 1, NOT_REACHED: 1 },
				successful: 4,
			};
			const pipelineGroup = groupWith(pipelineFigures);

			it("reads each stage's median with the reps it covers, and · for a stage no rep graded", async () => {
				respondingWith(pipelineGroup);

				await renderPage().findByText(GROUP);

				expect(cellOf(GROUP, "Step grades").textContent).toBe(
					"A (n=6) B (n=5) ·",
				);
			});

			it("reads how many of the reps the final judge graded it passed, naming the reps it did not grade", async () => {
				respondingWith(pipelineGroup);

				await renderPage().findByText(GROUP);

				expect(cellOf(GROUP, "Task grade").textContent).toBe(
					"4 of 5 PASSgraded independently · 1 of 6 reps not judged",
				);
			});

			it("reads only that it was graded independently when the final judge graded every rep", async () => {
				respondingWith(
					groupWith({
						...pipelineFigures,
						finalOutcomes: { PASS: 4, FAIL: 2 },
					}),
				);

				await renderPage().findByText(GROUP);

				expect(cellOf(GROUP, "Task grade").textContent).toBe(
					"4 of 6 PASSgraded independently",
				);
			});

			it("reads — with the reps not judged when the final judge graded none", async () => {
				respondingWith(
					groupWith({
						...pipelineFigures,
						finalOutcomes: { NOT_REACHED: 6 },
						successful: 0,
					}),
				);

				await renderPage().findByText(GROUP);

				expect(cellOf(GROUP, "Task grade").textContent).toBe(
					"—not reached · 6 of 6 reps not judged",
				);
			});
		});

		describe("in stage mode", () => {
			const stageGroup = groupWith({
				mode: "stage",
				reps: 3,
				pipelineStages: {
					state: "available",
					stages: ["shape", "build", "review"],
				},
				stageSummaries: [summary("build", "B", 3)],
				finalOutcomes: { NOT_APPLICABLE: 3 },
				successful: 3,
			});

			it("places its stage's median at the stage's position", async () => {
				respondingWith(stageGroup);

				await renderPage().findByText(GROUP);

				expect(cellOf(GROUP, "Step grades").textContent).toBe("· B (n=3) ·");
			});

			it("reads n/a as its task grade", async () => {
				respondingWith(stageGroup);

				await renderPage().findByText(GROUP);

				expect(cellOf(GROUP, "Task grade")).toHaveTextContent(
					"n/astep replay only",
				);
			});
		});

		describe("in session mode", () => {
			const sessionFigures: GroupFigures = {
				mode: "session",
				reps: 6,
				pipelineStages: {
					state: "unavailable",
					reasons: ["a session group repeats one session and runs no pipeline"],
				},
				stageSummaries: [
					{
						stage: "checks",
						graded: 0,
						ungraded: {},
						grades: { state: "unavailable", reasons: [SESSION_GRADE_REASON] },
					},
				],
				finalOutcomes: { NOT_APPLICABLE: 6 },
				successful: 4,
			};
			const sessionGroup = groupWith(sessionFigures);

			it("reads how many reps passed their checks as its step grades", async () => {
				respondingWith(sessionGroup);

				await renderPage().findByText(GROUP);

				expect(cellOf(GROUP, "Step grades").textContent).toBe(
					"4 of 6 reps passed",
				);
			});

			it("counts only the reps it recorded, naming the reps it could not", async () => {
				respondingWith(
					groupWith({
						...sessionFigures,
						finalOutcomes: { NOT_APPLICABLE: 5 },
					}),
				);

				await renderPage().findByText(GROUP);

				expect(cellOf(GROUP, "Step grades").textContent).toBe(
					"4 of 5 reps passed1 of 6 reps not recorded",
				);
			});

			it("reads n/a with why a session has no letter as its task grade", async () => {
				respondingWith(sessionGroup);

				await renderPage().findByText(GROUP);

				expect(cellOf(GROUP, "Task grade")).toHaveTextContent(
					`n/a${SESSION_GRADE_REASON}`,
				);
			});
		});
	});

	describe("the step grades and task grade of a session attempt", () => {
		const ATTEMPT = "0f6b6f2a-0000-4000-8000-000000000009";

		function attemptWith(
			figures: Pick<SessionAttemptRow, "status" | "checks">,
		): RunHistoryResponseBody {
			return {
				rows: [
					{
						kind: "session-attempt",
						...UNREAD_SESSION_ATTEMPT_FIGURES,
						...figures,
						staleness: UNREAD_STALENESS,
						corpusVersion: undefined,
						shortId: undefined,
						caseId: "brief-reply",
						uuid: ATTEMPT,
						links: [],
					},
				],
				launches: [],
				unreadable: [],
			};
		}

		it("reads how many of its checks passed as its step grades", async () => {
			respondingWith(
				attemptWith({
					status: "UNSUCCESSFUL",
					checks: { state: "available", passed: 2, declared: 3 },
				}),
			);

			await renderPage().findByText(ATTEMPT);

			expect(cellOf(ATTEMPT, "Step grades")).toHaveTextContent(
				"2 of 3 checks passed",
			);
		});

		it("reads its outcome with why no check ran when it recorded none", async () => {
			respondingWith(
				attemptWith({
					status: "NO_REPLY",
					checks: {
						state: "unavailable",
						reasons: ["the session gave no reply, so no check ran"],
					},
				}),
			);

			await renderPage().findByText(ATTEMPT);

			expect(cellOf(ATTEMPT, "Step grades")).toHaveTextContent(
				"NO_REPLYthe session gave no reply, so no check ran",
			);
		});

		it("reads n/a with why a session has no letter as its task grade", async () => {
			respondingWith(
				attemptWith({
					status: "SUCCESSFUL",
					checks: { state: "available", passed: 1, declared: 1 },
				}),
			);

			await renderPage().findByText(ATTEMPT);

			expect(cellOf(ATTEMPT, "Task grade")).toHaveTextContent(
				`n/a${SESSION_GRADE_REASON}`,
			);
		});
	});

	describe("when two recorded attempts are compared", () => {
		const RUN = "2026-09-06T21-58-29.508Z";

		function stageGroup(
			groupId: string,
			checkpoint: { readonly run: string; readonly stage: string } | undefined,
		): RunHistoryResponseBody["rows"][number] {
			return {
				kind: "group",
				staleness: UNREAD_STALENESS,
				corpusVersion: undefined,
				checkpoint,
				...UNREAD_GROUP_FIGURES,
				shortId: undefined,
				groupId,
				caseId: "audit-log",
				mode: "stage",
				reps: 3,
				repAttempts: [],
				links: [],
			};
		}

		const history: RunHistoryResponseBody = {
			rows: [
				stageGroup("group-without-skill", { run: RUN, stage: "build" }),
				stageGroup("group-with-skill", { run: RUN, stage: "build" }),
				stageGroup("group-at-shape", { run: RUN, stage: "shape" }),
				stageGroup("group-unplaced", undefined),
			],
			launches: [],
			unreadable: [],
		};

		function choice(groupId: string): HTMLElement {
			return screen.getByRole("checkbox", {
				name: `Compare ${groupId}`,
			});
		}

		it("offers to compare only groups whose checkpoint is recorded", async () => {
			respondingWith(history);

			await renderPage().findByText("group-unplaced");

			expect(choice("group-without-skill")).toBeInTheDocument();
			expect(
				screen.queryByRole("checkbox", { name: "Compare group-unplaced" }),
			).not.toBeInTheDocument();
		});

		it("once one is chosen, offers only groups replayed at its checkpoint", async () => {
			respondingWith(history);
			await renderPage().findByText("group-unplaced");

			fireEvent.click(choice("group-without-skill"));

			expect(choice("group-with-skill")).toBeEnabled();
			expect(choice("group-at-shape")).toBeDisabled();
			expect(
				screen.queryByRole("button", { name: "Compare these attempts" }),
			).not.toBeInTheDocument();
		});

		it("compares the first chosen as arm A and the second as arm B", async () => {
			stubFetchByPath(
				new Map<string, unknown>([
					["/api/runs", history],
					[
						"/api/settings",
						{
							spendCeilingUsd: 5,
							setCommand: "rehearse settings --spend-ceiling-usd <USD>",
							recordsDirectory: "/records",
							linkedCorpus: { kind: "live", root: "/home/.claude" },
							overrun: "The ceiling can be overrun by the calls in flight.",
						},
					],
				]),
			);
			await renderPage().findByText("group-unplaced");

			fireEvent.click(choice("group-without-skill"));
			fireEvent.click(choice("group-with-skill"));
			fireEvent.click(
				screen.getByRole("button", { name: "Compare these attempts" }),
			);
			const dialog = await screen.findByRole("dialog");

			expect(
				within(dialog).getByText("Arm A").nextElementSibling,
			).toHaveTextContent("group-without-skill");
			expect(
				within(dialog).getByText("Arm B").nextElementSibling,
			).toHaveTextContent("group-with-skill");
			expect(
				within(dialog).getByRole("button", { name: "Start · 3 attempts" }),
			).toBeInTheDocument();
		});
	});

	describe("the cost and wall time of a record", () => {
		const RUN = "2026-09-20T10-00-00.000Z";
		const ATTEMPT = "0f6b6f2a-0000-4000-8000-000000000009";
		const REPLAY = "2026-09-21T09-20-00.000Z";
		const GROUP = "group-0143";
		const SPENT: PipelineRunRow["cost"] = {
			state: "available",
			usd: 2.41,
			parts: [{ part: "build session", usd: 2.41 }],
			missing: [],
		};
		const SIX_TWELVE: PipelineRunRow["wallTime"] = {
			state: "available",
			ms: 372_000,
		};

		type CostAndTime = Pick<PipelineRunRow, "cost" | "wallTime">;

		/** One record of each kind, each carrying the same cost and wall time. */
		function everyKindWith(figures: CostAndTime): RunHistoryResponseBody {
			const record = {
				...figures,
				staleness: UNREAD_STALENESS,
				corpusVersion: undefined,
				shortId: undefined,
				caseId: "audit-log",
				links: [],
			};

			return {
				rows: [
					{
						kind: "run",
						...UNREAD_RUN_FIGURES,
						...record,
						launchId: undefined,
						checkpoints: [],
						run: RUN,
						status: "COMPLETE",
						stage: "review",
						grade: undefined,
						corpusChangedDuringRun: false,
						progress: { state: "recorded" },
					},
					{
						kind: "session-attempt",
						...UNREAD_SESSION_ATTEMPT_FIGURES,
						...record,
						uuid: ATTEMPT,
						status: "SUCCESSFUL",
					},
					{
						kind: "replay",
						...UNREAD_REPLAY_FIGURES,
						...record,
						lineage: "60758c",
						timestamp: REPLAY,
						checkpointShortId: undefined,
						attempt: undefined,
						stage: "build",
						grade: "B+",
						status: "CONTINUE",
					},
					{
						kind: "group",
						...UNREAD_GROUP_FIGURES,
						...record,
						groupId: GROUP,
						mode: "stage",
						checkpoint: undefined,
						reps: 3,
						repAttempts: [],
					},
				],
				launches: [],
				unreadable: [],
			};
		}

		const KINDS = [
			["pipeline run", RUN],
			["session attempt", ATTEMPT],
			["replay", REPLAY],
			["confirmation group", GROUP],
		] as const;

		it.each(KINDS)(
			"reads a %s's recorded cost in dollars",
			async (_kind, identity) => {
				respondingWith(everyKindWith({ cost: SPENT, wallTime: SIX_TWELVE }));

				await renderPage().findByText(identity);

				expect(cellOf(identity, "Cost").textContent).toBe("$2.41");
			},
		);

		it.each(KINDS)(
			"reads a %s's wall time as minutes and seconds",
			async (_kind, identity) => {
				respondingWith(everyKindWith({ cost: SPENT, wallTime: SIX_TWELVE }));

				await renderPage().findByText(identity);

				expect(cellOf(identity, "Wall").textContent).toBe("06:12");
			},
		);

		it("aligns the cost and wall time on the cell's right edge", async () => {
			respondingWith(everyKindWith({ cost: SPENT, wallTime: SIX_TWELVE }));

			await renderPage().findByText(RUN);

			expect(cellOf(RUN, "Cost")).toHaveAttribute("data-numeric");
			expect(cellOf(RUN, "Wall")).toHaveAttribute("data-numeric");
		});

		/** A sum that lacks a part would otherwise be read as the whole spend. */
		it("says the cost is partial and names each part the sum lacks", async () => {
			respondingWith(
				everyKindWith({
					cost: {
						...SPENT,
						missing: [
							{ part: "Product Owner", reason: "no main artifact" },
							{ part: "rep-2", reason: "no metrics" },
						],
					},
					wallTime: SIX_TWELVE,
				}),
			);

			await renderPage().findByText(RUN);

			expect(cellOf(RUN, "Cost").textContent).toBe(
				"$2.41partial · lacks Product Owner, rep-2why",
			);
		});

		it("shows why each part the cost lacks is missing on request", async () => {
			respondingWith(
				everyKindWith({
					cost: {
						...SPENT,
						missing: [
							{ part: "Product Owner", reason: "no main artifact" },
							{ part: "rep-2", reason: "no metrics" },
						],
					},
					wallTime: SIX_TWELVE,
				}),
			);
			await renderPage().findByText(RUN);

			fireEvent.click(
				within(cellOf(RUN, "Cost")).getByRole("button", { name: "why" }),
			);

			expect(cellOf(RUN, "Cost").textContent).toBe(
				"$2.41partial · lacks Product Owner, rep-2hideProduct Owner: no main artifactrep-2: no metrics",
			);
		});

		it("reads an unavailable cost as unrecorded with its reason", async () => {
			respondingWith(
				everyKindWith({
					cost: { state: "unavailable", reasons: ["no call metrics"] },
					wallTime: SIX_TWELVE,
				}),
			);

			await renderPage().findByText(RUN);

			expect(cellOf(RUN, "Cost").textContent).toBe("unrecordedno call metrics");
		});

		it("reads an unavailable wall time as unrecorded with its reason", async () => {
			respondingWith(
				everyKindWith({
					cost: SPENT,
					wallTime: { state: "unavailable", reasons: ["no run events"] },
				}),
			);

			await renderPage().findByText(RUN);

			expect(cellOf(RUN, "Wall").textContent).toBe("unrecordedno run events");
		});
	});

	describe("the outcome of a finished record", () => {
		const RUN = "2026-09-20T10-00-00.000Z";
		const MINIMUM_B: PipelineRunRow["minimumGrade"] = {
			state: "available",
			letter: "B−",
		};

		function stage(
			name: string,
			letter: string,
			reachesMinimum: boolean,
		): ListedStageGrade {
			return {
				stage: name,
				status: reachesMinimum ? "graded" : "stopped",
				grade: {
					state: "available",
					letter,
					verdict: reachesMinimum ? "CONTINUE" : "STOP",
					reachesMinimum,
				},
			};
		}

		function notRun(name: string): ListedStageGrade {
			return {
				stage: name,
				status: "not-run",
				grade: { state: "unavailable", reasons: ["never reached"] },
			};
		}

		function runWith(
			figures: Pick<
				PipelineRunRow,
				"status" | "stageGrades" | "finalOutcome" | "minimumGrade"
			>,
		): RunHistoryResponseBody {
			return {
				rows: [
					{
						kind: "run",
						...UNREAD_RUN_FIGURES,
						...figures,
						launchId: undefined,
						shortId: undefined,
						checkpoints: [],
						links: [],
						run: RUN,
						caseId: "audit-log",
						stage: undefined,
						grade: undefined,
						corpusVersion: undefined,
						corpusChangedDuringRun: false,
						staleness: UNREAD_STALENESS,
						progress: { state: "recorded" },
					},
				],
				launches: [],
				unreadable: [],
			};
		}

		const STOPPED_AT_IMPLEMENT = runWith({
			status: "STOPPED:implement",
			stageGrades: {
				state: "available",
				grades: [
					stage("shape", "A−", true),
					stage("plan", "B+", true),
					stage("implement", "D", false),
					notRun("review"),
				],
			},
			finalOutcome: {
				state: "available",
				status: "NOT_REACHED",
				stage: "implement",
				reason: "stopped below the minimum",
			},
			minimumGrade: MINIMUM_B,
		});

		it("reads a stopped run as stopped at its step, with that step's grade and the minimum it fell below", async () => {
			respondingWith(STOPPED_AT_IMPLEMENT);

			await renderPage().findByText(RUN);

			expect(cellOf(RUN, "Outcome").textContent).toBe(
				"◼stopped at step 3implement D · below minimum B−",
			);
		});

		it("links a stopped run's reason to the step it stopped at", async () => {
			respondingWith(STOPPED_AT_IMPLEMENT);

			await renderPage().findByText(RUN);

			expect(
				within(cellOf(RUN, "Outcome")).getByRole("link", {
					name: "implement D · below minimum B−",
				}),
			).toHaveAttribute("href", `/runs/${RUN}/stages/implement`);
		});

		it("names why a stopped run's grade or minimum is missing", async () => {
			respondingWith(
				runWith({
					status: "STOPPED:implement",
					stageGrades: {
						state: "available",
						grades: [
							stage("shape", "A−", true),
							{
								stage: "implement",
								status: "stopped",
								grade: {
									state: "unavailable",
									reasons: ["the stop record keeps no letter"],
								},
							},
						],
					},
					finalOutcome: {
						state: "unavailable",
						reasons: ["not read by this test"],
					},
					minimumGrade: {
						state: "unavailable",
						reasons: ["the manifest predates the minimum"],
					},
				}),
			);

			await renderPage().findByText(RUN);

			expect(cellOf(RUN, "Outcome").textContent).toBe(
				"◼stopped at step 2implement · the stop record keeps no letter · the manifest predates the minimum",
			);
		});

		it("reads a completed run as completed with every step at or above the minimum", async () => {
			respondingWith(
				runWith({
					status: "COMPLETE",
					stageGrades: {
						state: "available",
						grades: [
							stage("shape", "A−", true),
							stage("plan", "B+", true),
							stage("implement", "B", true),
						],
					},
					finalOutcome: {
						state: "available",
						status: "JUDGED",
						verdict: "PASS",
					},
					minimumGrade: MINIMUM_B,
				}),
			);

			await renderPage().findByText(RUN);

			expect(cellOf(RUN, "Outcome").textContent).toBe(
				"✓completed 3 of 3all steps at or above minimum",
			);
		});

		it("counts a completed run's steps graded at or above the minimum when some carry no grade", async () => {
			respondingWith(
				runWith({
					status: "COMPLETE",
					stageGrades: {
						state: "available",
						grades: [
							stage("shape", "A−", true),
							{
								stage: "plan",
								status: "no-record",
								grade: { state: "unavailable", reasons: ["no record"] },
							},
						],
					},
					finalOutcome: {
						state: "available",
						status: "JUDGED",
						verdict: "PASS",
					},
					minimumGrade: MINIMUM_B,
				}),
			);

			await renderPage().findByText(RUN);

			expect(cellOf(RUN, "Outcome").textContent).toBe(
				"✓completed 2 of 21 of 2 steps graded at or above minimum",
			);
		});

		it.each([
			["INTERRUPTED", "the run was interrupted before its final judge"],
			["FAILED", "the run failed before its final judge"],
		])(
			"reads a run that ended %s as interrupted, naming the step and the cause",
			async (status, reason) => {
				respondingWith(
					runWith({
						status,
						stageGrades: {
							state: "available",
							grades: [stage("shape", "B", true), notRun("plan")],
						},
						finalOutcome: {
							state: "available",
							status: "NOT_REACHED",
							stage: "plan",
							reason,
						},
						minimumGrade: MINIMUM_B,
					}),
				);

				await renderPage().findByText(RUN);

				expect(cellOf(RUN, "Outcome").textContent).toBe(
					`⊘interrupted at step 2plan · ${reason}`,
				);
			},
		);

		describe("of a replay", () => {
			const REPLAY = "2026-09-21T09-20-00.000Z";

			function replayWith(
				figures: Pick<ReplayRow, "status" | "attempt">,
			): RunHistoryResponseBody {
				return {
					rows: [
						{
							kind: "replay",
							...UNREAD_REPLAY_FIGURES,
							...figures,
							staleness: UNREAD_STALENESS,
							corpusVersion: undefined,
							shortId: undefined,
							checkpointShortId: undefined,
							lineage: "60758c",
							timestamp: REPLAY,
							caseId: "audit-log",
							stage: "build",
							grade: "B+",
							links: [],
						},
					],
					launches: [],
					unreadable: [],
				};
			}

			it("reads its verdict, with its attempt's place at its checkpoint", async () => {
				respondingWith(
					replayWith({
						status: "CONTINUE",
						attempt: { position: 3, count: 3 },
					}),
				);

				await renderPage().findByText(REPLAY);

				expect(cellOf(REPLAY, "Outcome").textContent).toBe(
					"✓verdict CONTINUEattempt 3 of 3 at this checkpoint",
				);
			});

			it("reads a stop verdict without calling the replay a failure", async () => {
				respondingWith(
					replayWith({ status: "STOP", attempt: { position: 1, count: 2 } }),
				);

				await renderPage().findByText(REPLAY);

				expect(cellOf(REPLAY, "Outcome").textContent).toBe(
					"◼verdict STOPattempt 1 of 2 at this checkpoint",
				);
			});

			it("says when its attempt's place was not recorded", async () => {
				respondingWith(replayWith({ status: "CONTINUE", attempt: undefined }));

				await renderPage().findByText(REPLAY);

				expect(cellOf(REPLAY, "Outcome").textContent).toBe(
					"✓verdict CONTINUEattempt position not recorded",
				);
			});
		});

		describe("of a confirmation group", () => {
			const GROUP = "group-0143";

			function groupWith(
				figures: Pick<
					ConfirmationGroupRow,
					"reps" | "finalOutcomes" | "successful"
				>,
			): RunHistoryResponseBody {
				return {
					rows: [
						{
							kind: "group",
							...UNREAD_GROUP_FIGURES,
							...figures,
							mode: "session",
							staleness: UNREAD_STALENESS,
							corpusVersion: undefined,
							checkpoint: undefined,
							shortId: undefined,
							groupId: GROUP,
							caseId: "audit-log",
							repAttempts: [],
							links: [],
						},
					],
					launches: [],
					unreadable: [],
				};
			}

			it("reads how many of the reps it requested it recorded, and how many succeeded", async () => {
				respondingWith(
					groupWith({
						reps: 6,
						finalOutcomes: { SUCCESSFUL: 4, UNSUCCESSFUL: 2 },
						successful: 4,
					}),
				);

				await renderPage().findByText(GROUP);

				expect(cellOf(GROUP, "Outcome").textContent).toBe(
					"✓6 of 6 recorded4 successful",
				);
			});

			it("marks a group that recorded fewer reps than it requested as pending", async () => {
				respondingWith(
					groupWith({
						reps: 6,
						finalOutcomes: { SUCCESSFUL: 2 },
						successful: 2,
					}),
				);

				await renderPage().findByText(GROUP);

				expect(cellOf(GROUP, "Outcome").textContent).toBe(
					"◌2 of 6 recorded2 successful",
				);
			});
		});

		describe("of a session attempt", () => {
			const ATTEMPT = "0f6b6f2a-0000-4000-8000-000000000009";

			function attemptWith(
				figures: Pick<SessionAttemptRow, "status" | "checks">,
			): RunHistoryResponseBody {
				return {
					rows: [
						{
							kind: "session-attempt",
							...UNREAD_SESSION_ATTEMPT_FIGURES,
							...figures,
							staleness: UNREAD_STALENESS,
							corpusVersion: undefined,
							shortId: undefined,
							caseId: "brief-reply",
							uuid: ATTEMPT,
							links: [],
						},
					],
					launches: [],
					unreadable: [],
				};
			}

			it.each([
				[
					"SUCCESSFUL",
					{ passed: 3, declared: 3 },
					"✓successfulall checks passed",
				],
				[
					"UNSUCCESSFUL",
					{ passed: 1, declared: 3 },
					"◼unsuccessful2 of 3 checks failed",
				],
				[
					"UNSUCCESSFUL",
					{ passed: 0, declared: 1 },
					"◼unsuccessful1 of 1 check failed",
				],
			] as const)(
				"reads a %s attempt's outcome with its checks",
				async (status, checks, expected) => {
					respondingWith(
						attemptWith({ status, checks: { state: "available", ...checks } }),
					);

					await renderPage().findByText(ATTEMPT);

					expect(cellOf(ATTEMPT, "Outcome").textContent).toBe(expected);
				},
			);

			it.each([
				["NO_REPLY", "⊘no replythe session gave no reply"],
				["EXECUTION_FAILED", "⊘failed to runthe session gave no reply"],
			] as const)(
				"reads a %s attempt's outcome with why no check ran",
				async (status, expected) => {
					respondingWith(
						attemptWith({
							status,
							checks: {
								state: "unavailable",
								reasons: ["the session gave no reply"],
							},
						}),
					);

					await renderPage().findByText(ATTEMPT);

					expect(cellOf(ATTEMPT, "Outcome").textContent).toBe(expected);
				},
			);
		});
	});
});
