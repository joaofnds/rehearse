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
import type { InferResponseType } from "hono/client";
import type { apiClient } from "#client/api-client";
import { stubFetch } from "#client/test-support/fetch-stub";
import {
	UNREAD_COST_AND_TIME,
	UNREAD_GROUP_FIGURES,
	UNREAD_REPLAY_FIGURES,
	UNREAD_RUN_FIGURES,
	UNREAD_STALENESS,
	unversionedStaleness,
} from "#client/test-support/run-figures";
import type { RowStaleness } from "#server/run-history";
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

	return render(
		<QueryClientProvider client={client}>
			<RunHistoryPage />
		</QueryClientProvider>,
	);
}

function oneStoppedOneComplete(): RunHistoryResponseBody {
	return {
		rows: [
			{
				kind: "run",
				...UNREAD_RUN_FIGURES,
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
		respondingWith({ rows: [], unreadable: [] });

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

	it("renders a row for every recorded run, status and corpus as design-system components", async () => {
		respondingWith({
			rows: [
				{
					kind: "run",
					...UNREAD_RUN_FIGURES,
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
			unreadable: [],
		});

		renderPage();

		await waitFor(() => {
			expect(screen.getByText("2026-09-06T21-58-29.508Z")).toBeInTheDocument();
		});
		expect(screen.getByText("audit-log")).toBeInTheDocument();
		expect(screen.getByText("stopped")).toBeInTheDocument();
		expect(screen.getByText("corpus@a3a62f")).toBeInTheDocument();
		expect(screen.getByText("stale")).toBeInTheDocument();
		expect(screen.getByText("B")).toBeInTheDocument();
	});

	it("links a stopped run to the stage it stopped on, not its last checkpoint", async () => {
		respondingWith(oneStoppedOneComplete());

		const page = renderPage();

		expect(await page.findByRole("link", { name: /build/u })).toHaveAttribute(
			"href",
			"/runs/2026-09-06T21-58-29.508Z/stages/build",
		);
	});

	it("leaves a status that is not a stop as text, linking nowhere", async () => {
		respondingWith(oneStoppedOneComplete());

		await renderPage().findByText("2026-09-03T00-00-00.000Z");

		const outcome = cellOf("2026-09-03T00-00-00.000Z", "Outcome");
		expect(outcome).toHaveTextContent("COMPLETE");
		expect(within(outcome).queryByRole("link")).not.toBeInTheDocument();
	});

	it("leaves the run id unlinked, since it belongs to Run detail rather than a stage page", async () => {
		respondingWith(oneStoppedOneComplete());

		await renderPage().findByText("2026-09-06T21-58-29.508Z");

		expect(
			within(cellOf("2026-09-06T21-58-29.508Z", "Run")).queryByRole("link"),
		).not.toBeInTheDocument();
	});

	it("names the records table once, so the caption is not doubled by a heading", async () => {
		respondingWith({
			rows: [
				{
					kind: "run",
					...UNREAD_RUN_FIGURES,
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
			unreadable: [],
		});

		renderPage();

		await waitFor(() => {
			expect(screen.getByRole("table")).toHaveAccessibleName("DURABLE RECORDS");
		});
		expect(screen.getAllByText("DURABLE RECORDS")).toHaveLength(1);
	});

	it("renders a pending grade cell for a row with no recorded grade", async () => {
		respondingWith({
			rows: [
				{
					kind: "run",
					...UNREAD_RUN_FIGURES,
					shortId: undefined,
					checkpoints: [],
					links: [],
					run: "2026-09-04T00-00-00.000Z",
					caseId: "audit-log",
					status: "STOPPED:discuss",
					stage: undefined,
					grade: undefined,
					corpusVersion: { kind: "version", digest: "a3a62f" },
					corpusChangedDuringRun: false,
					staleness: unversionedStaleness({ stale: false, causes: [] }),
					progress: { state: "recorded" },
				},
			],
			unreadable: [],
		});

		renderPage();

		await waitFor(() => {
			expect(screen.getByText("2026-09-04T00-00-00.000Z")).toBeInTheDocument();
		});
		expect(cellOf("2026-09-04T00-00-00.000Z", "Grade")).toHaveTextContent("—");
	});

	it("renders a filter bar built from FilterPill, all pressed by default", async () => {
		respondingWith({ rows: [], unreadable: [] });

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
				shortId: undefined,
				checkpoints: [],
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
					elapsedMs: 9000,
					measuredAt: new Date().toISOString(),
					spentUsd: 0.9,
					spendScope: "this stage's session so far",
				},
			};
		}

		it("lists the running run beside the finished ones, marked running", async () => {
			respondingWith({ rows: [runningRow()], unreadable: [] });

			renderPage();

			await waitFor(() => {
				expect(
					screen.getByText("2026-09-07T00-00-00.000Z"),
				).toBeInTheDocument();
			});
			expect(screen.getByText("running")).toBeInTheDocument();
		});

		it("reads out the stage the run is in, how long it has run, and what it has spent", async () => {
			respondingWith({ rows: [runningRow()], unreadable: [] });

			renderPage();

			await waitFor(() => {
				expect(screen.getByText("build")).toBeInTheDocument();
			});
			expect(screen.getByText("9s")).toBeInTheDocument();
			expect(screen.getByText("$0.90")).toBeInTheDocument();
		});

		/**
		 * The number alone would be read as the run's total, which it is not:
		 * every event kind scopes its spend differently, and one scoped to a
		 * single stage falls when the next stage begins.
		 */
		it("says what the spend figure covers rather than presenting it as the run total", async () => {
			respondingWith({ rows: [runningRow()], unreadable: [] });

			renderPage();

			await waitFor(() => {
				expect(screen.getByText("$0.90")).toBeInTheDocument();
			});
			expect(
				screen.getByText("this stage's session so far"),
			).toBeInTheDocument();
			expect(screen.queryByText(/spent this run/iu)).not.toBeInTheDocument();
		});

		/**
		 * Scoped to the cell rather than the document: the page's own empty-state
		 * copy says "a spend limit is set", so a document-wide search for that
		 * word would fail for a reason that has nothing to do with the row.
		 */
		it("shows no spend ceiling or limit beside the figure", async () => {
			respondingWith({ rows: [runningRow()], unreadable: [] });

			renderPage();

			await waitFor(() => {
				expect(screen.getByText("$0.90")).toBeInTheDocument();
			});
			const cell = screen.getByText("$0.90").closest("td");
			if (cell === null) {
				throw new Error("the spend figure is not inside a table cell");
			}
			const progress = within(cell);
			expect(progress.queryByText(/\/\s*\$/u)).not.toBeInTheDocument();
			expect(
				progress.queryByText(/limit|ceiling|budget/iu),
			).not.toBeInTheDocument();
		});

		/**
		 * The one thing this screen exists to do while a run is going. The
		 * operator is watching a row, not reloading a page, so a reading that
		 * only moves on refresh is the same as no reading at all.
		 */
		it("moves the stage, elapsed and spend readings with no page reload", async () => {
			const bodies: RunHistoryResponseBody[] = [
				{ rows: [runningRow()], unreadable: [] },
				{
					rows: [
						{
							...runningRow(),
							progress: {
								state: "running",
								stage: "review",
								elapsedMs: 74_000,
								measuredAt: new Date().toISOString(),
								spentUsd: 2.5,
								spendScope: "this stage's session and its judge",
							},
						},
					],
					unreadable: [],
				},
			];
			const stub = (): Promise<Response> =>
				Promise.resolve(Response.json(bodies.shift()));
			stub.preconnect = fetch.preconnect;
			globalThis.fetch = stub;

			renderPage();

			await waitFor(() => {
				expect(screen.getByText("build")).toBeInTheDocument();
			});
			expect(screen.getByText("9s")).toBeInTheDocument();

			await waitFor(
				() => {
					expect(screen.getByText("review")).toBeInTheDocument();
				},
				{ timeout: 5000 },
			);
			expect(screen.getByText("1m")).toBeInTheDocument();
			expect(screen.getByText("$2.50")).toBeInTheDocument();
		});

		/**
		 * A run reports its elapsed time once per agent turn, minutes apart, so a
		 * row showing only the recorded figure would sit frozen between turns
		 * while the run is plainly still going.
		 */
		it("keeps the elapsed reading moving between the run's own measurements", async () => {
			respondingWith({
				rows: [
					{
						...runningRow(),
						progress: {
							state: "running",
							stage: "build",
							elapsedMs: 9000,
							measuredAt: new Date(Date.now() - 52_000).toISOString(),
							spentUsd: 0.9,
							spendScope: "this stage's session so far",
						},
					},
				],
				unreadable: [],
			});

			const page = renderPage();

			await waitFor(() => {
				expect(page.getByText("1m")).toBeInTheDocument();
			});
			expect(page.queryByText("9s")).not.toBeInTheDocument();
		});

		it("stops re-reading the list once no run is in flight", async () => {
			let requests = 0;
			const stub = (): Promise<Response> => {
				requests += 1;

				return Promise.resolve(
					Response.json({
						rows: [{ ...runningRow(), progress: { state: "recorded" } }],
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

		it("leaves the finished rows' readings blank rather than showing a zero", async () => {
			respondingWith({
				rows: [
					{
						kind: "run",
						...UNREAD_RUN_FIGURES,
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
	});

	it("shows the badge and the cause in the corpus cell for a stale row that recorded no checkpoint stage, with no pill", async () => {
		respondingWith({
			rows: [
				{
					kind: "run",
					...UNREAD_RUN_FIGURES,
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
			respondingWith({ rows: [], unreadable: unreadableReport.unreadable });

			renderPage();

			await screen.findByRole("alert");

			expect(screen.queryByText("No runs recorded")).not.toBeInTheDocument();
		});

		it("keeps the empty state when rows exist, the filter hides them, and nothing was unreadable", async () => {
			respondingWith({ ...unreadableReport, unreadable: [] });

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
					...UNREAD_COST_AND_TIME,
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
			unreadable: [],
		};

		it("lists each record by its own identity, unlinked, with its outcome", async () => {
			respondingWith(everyKind);

			await renderPage().findByText("group-a");

			for (const [identity, outcome] of [
				["2026-09-17T12-50-49.127Z", "FAILED"],
				["2026-09-06T22-33-15.057Z", "STOP"],
				["0f6b6f2a-0000-4000-8000-000000000001", "UNSUCCESSFUL"],
			] as const) {
				expect(
					within(cellOf(identity, "Run")).queryByRole("link"),
				).not.toBeInTheDocument();
				expect(cellOf(identity, "Outcome")).toHaveTextContent(outcome);
			}
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
						elapsedMs: 9000,
						measuredAt: new Date().toISOString(),
						spentUsd: 0.9,
						spendScope: "this stage's session so far",
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
});
