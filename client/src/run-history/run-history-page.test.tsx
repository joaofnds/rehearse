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
				run: "2026-09-06T21-58-29.508Z",
				caseId: "audit-log",
				status: "STOPPED:build",
				stage: "shape",
				grade: "B",
				corpus: { digest: "a3a62f" },
				stale: true,
				staleCauses: [],
				progress: { state: "recorded" },
			},
			{
				run: "2026-09-03T00-00-00.000Z",
				caseId: "audit-log",
				status: "COMPLETE",
				stage: "build",
				grade: "A",
				corpus: { digest: "b1c2d3" },
				stale: false,
				staleCauses: [],
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
					run: "2026-09-06T21-58-29.508Z",
					caseId: "audit-log",
					status: "COMPLETE",
					stage: "build",
					grade: "B",
					corpus: { digest: "a3a62f" },
					stale: true,
					staleCauses: [
						"Corpus file CLAUDE.md resolves outside the corpus source, which would hash bytes the corpus does not hold",
					],
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
					run: "2026-09-06T21-58-29.508Z",
					caseId: "audit-log",
					status: "STOPPED:build",
					stage: "shape",
					grade: "B",
					corpus: { digest: "a3a62f" },
					stale: true,
					staleCauses: ["CLAUDE.md changed"],
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

	it("names the records table once, so the caption is not doubled by a heading", async () => {
		respondingWith({
			rows: [
				{
					run: "2026-09-06T21-58-29.508Z",
					caseId: "audit-log",
					status: "STOPPED:build",
					stage: "shape",
					grade: "B",
					corpus: { digest: "a3a62f" },
					stale: true,
					staleCauses: ["CLAUDE.md changed"],
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
					run: "2026-09-04T00-00-00.000Z",
					caseId: "audit-log",
					status: "STOPPED:discuss",
					stage: undefined,
					grade: undefined,
					corpus: { digest: "a3a62f" },
					stale: false,
					staleCauses: [],
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

	it("names the cause when a row is stale for one reason", async () => {
		respondingWith({
			rows: [
				{
					run: "2026-09-06T21-58-29.508Z",
					caseId: "audit-log",
					status: "STOPPED:build",
					stage: "shape",
					grade: "B",
					corpus: { digest: "a3a62f" },
					stale: true,
					staleCauses: ["CLAUDE.md changed"],
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
					run: "2026-09-06T21-58-29.508Z",
					caseId: "audit-log",
					status: "STOPPED:build",
					stage: "shape",
					grade: "B",
					corpus: { digest: "a3a62f" },
					stale: true,
					staleCauses: ["CLAUDE.md changed", "agents/advisor.md added"],
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
						run: "2026-09-06T00-00-00.000Z",
						caseId: "audit-log",
						status: "COMPLETE",
						stage: "build",
						grade: "A",
						corpus: { digest: "aaaaaa" },
						stale: true,
						staleCauses: ["CLAUDE.md changed", "agents/advisor.md added"],
						progress: { state: "recorded" },
					},
					{
						run: "2026-09-05T00-00-00.000Z",
						caseId: "audit-log",
						status: "STOPPED:build",
						stage: "build",
						grade: "B",
						corpus: { digest: "bbbbbb" },
						stale: true,
						staleCauses: [
							"output-styles/brief.md changed",
							"rulebook/coupling.md added",
							"rulebook/ownership.md changed",
						],
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
		const runningRow: RunHistoryResponseBody["rows"][number] = {
			run: "2026-09-07T00-00-00.000Z",
			caseId: "audit-log",
			status: "RUNNING",
			stage: undefined,
			grade: undefined,
			corpus: undefined,
			stale: false,
			staleCauses: [],
			progress: {
				state: "running",
				stage: "build",
				elapsedMs: 9000,
				measuredAt: new Date().toISOString(),
				spentUsd: 0.9,
				spendScope: "this stage's session so far",
			},
		};

		it("lists the running run beside the finished ones, marked running", async () => {
			respondingWith({ rows: [runningRow], unreadable: [] });

			renderPage();

			await waitFor(() => {
				expect(
					screen.getByText("2026-09-07T00-00-00.000Z"),
				).toBeInTheDocument();
			});
			expect(screen.getByText("running")).toBeInTheDocument();
		});

		it("reads out the stage the run is in, how long it has run, and what it has spent", async () => {
			respondingWith({ rows: [runningRow], unreadable: [] });

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
			respondingWith({ rows: [runningRow], unreadable: [] });

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
			respondingWith({ rows: [runningRow], unreadable: [] });

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
				{ rows: [runningRow], unreadable: [] },
				{
					rows: [
						{
							...runningRow,
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
						...runningRow,
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
						rows: [{ ...runningRow, progress: { state: "recorded" } }],
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
						run: "2026-09-06T00-00-00.000Z",
						caseId: "audit-log",
						status: "COMPLETE",
						stage: "build",
						grade: "A",
						corpus: { digest: "aaaaaa" },
						stale: false,
						staleCauses: [],
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
					run: "2026-09-05T00-00-00.000Z",
					caseId: "audit-log",
					status: "INTERRUPTED",
					stage: undefined,
					grade: undefined,
					corpus: undefined,
					stale: true,
					staleCauses: ["upstream stage initial is stale"],
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
					run: "2026-09-06T21-58-29.508Z",
					caseId: "audit-log",
					status: "COMPLETE",
					stage: "build",
					grade: "B",
					corpus: { digest: "a3a62f" },
					stale: false,
					staleCauses: [],
					progress: { state: "recorded" },
				},
			],
			unreadable: [
				{
					id: "run:2026-09-01T00-00-00.000Z",
					reason: "manifest.json is empty",
				},
				{
					id: "run:2026-09-02T00-00-00.000Z",
					reason: "artifact.json is empty",
				},
			],
		};

		it("names every unreadable run by id and reason in an alert", async () => {
			respondingWith(unreadableReport);

			renderPage();

			const alert = await screen.findByRole("alert");

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

			expect(screen.getByRole("alert")).toHaveTextContent(
				"run:2026-09-01T00-00-00.000Z",
			);
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

	it("renders a run with no recorded checkpoint without a corpus digest", async () => {
		respondingWith({
			rows: [
				{
					run: "2026-09-05T00-00-00.000Z",
					caseId: "audit-log",
					status: "STOPPED:discuss",
					stage: undefined,
					grade: undefined,
					corpus: undefined,
					stale: false,
					staleCauses: [],
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
	});
});
