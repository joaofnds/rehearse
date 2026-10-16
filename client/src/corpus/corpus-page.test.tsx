import { afterEach, describe, expect, it } from "bun:test";
import { z } from "zod";
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
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { InferResponseType } from "hono/client";
import type { apiClient, launchClient } from "#client/api-client";
import type { AppliedCorpusEdit } from "./corpus-edit-requests";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer, stubFetchByPath } from "#client/test-support/fetch-stub";
import { LiveReply } from "#client/test-support/live-reply";
import { CorpusPage } from "./corpus-page";
import type { OpenedCorpusFile } from "./corpus-page";
import { CORPUS_VERSION_HEADER } from "#server/corpus-version-header";
import {
	renderAppWithStub,
	renderWithRouter,
} from "#client/test-support/render-app";
import { recordStage, runRecord } from "#client/test-support/run-record";
import type { RunRecord } from "#server/run-record";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

type CorpusResponse = InferResponseType<typeof apiClient.api.corpus.$get>;

type SettingsReading = InferResponseType<
	typeof launchClient.api.settings.$get,
	200
>;

function corpusResponseBody(): CorpusResponse {
	return {
		root: "/home/user/.claude",
		digest: `a41c7e${"0".repeat(58)}`,
		files: [
			{
				path: "CLAUDE.md",
				sha256: "0".repeat(64),
				lastEditedAt: "2026-09-04T09:41:00.000Z",
				lines: 1,
				readBy: 23,
				invalidated: 0,
			},
		],
		refusals: [],
		lastEdit: {
			kind: "not-recorded",
			reason:
				"the corpus under test has no earlier version in its log to compare against",
		},
	};
}

/** The settings the screen reads to learn which corpus is linked. */
const LIVE_SETTINGS = {
	spendCeilingUsd: 5,
	setCommand: "rehearse settings --spend-ceiling-usd <USD>",
	recordsDirectory: "/records",
	linkedCorpus: { kind: "live", root: "/home/user/.claude" },
	liveCorpusRoot: "/home/user/.claude",
	overrun: "The ceiling can be overrun by the calls in flight.",
	linkCommand: "rehearse settings --link-corpus <directory>",
};

function renderPage(): void {
	stubFetchByPath(
		new Map<string, unknown>([
			["/api/corpus", corpusResponseBody()],
			["/api/settings", LIVE_SETTINGS],
		]),
	);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	renderWithRouter(
		<QueryClientProvider client={client}>
			<CorpusPage />
		</QueryClientProvider>,
	);
}

describe(CorpusPage.name, () => {
	it("renders the corpus root unredacted", async () => {
		renderPage();

		await waitFor(() => {
			expect(screen.getByText("/home/user/.claude")).toBeInTheDocument();
		});
	});

	it("labels the current version 'corpus@' over its first six characters, as run history does", async () => {
		renderPage();

		await waitFor(() => {
			expect(screen.getByText("corpus@a41c7e")).toBeInTheDocument();
		});
		expect(screen.queryByText(/corpus root@/u)).toBeNull();
	});

	it("renders one row per file with its path, hash, last-edited time, and read-by count", async () => {
		renderPage();

		await waitFor(() => {
			expect(screen.getByText("CLAUDE.md")).toBeInTheDocument();
		});
		expect(screen.getByText("23")).toBeInTheDocument();
	});

	describe("when editing a file of a linked directory", () => {
		const LINK_COMMAND = "rehearse settings --link-corpus <directory>";
		const OPENED_AT = `c63e9a${"0".repeat(58)}`;
		const STARTS_FROM = `a41c7e${"0".repeat(58)}`;
		const NEW_VERSION = `b52d8f${"0".repeat(58)}`;
		const RUN = "2026-09-03T00-00-00.000Z";

		function settingsReading(kind: "live" | "directory"): SettingsReading {
			return {
				spendCeilingUsd: 5,
				setCommand: "rehearse settings --spend-ceiling-usd <USD>",
				recordsDirectory: "/records",
				linkedCorpus: {
					kind,
					root: kind === "live" ? "/home/user/.claude" : "/tmp/corpus-copy",
				},
				liveCorpusRoot: "/home/user/.claude",
				overrun: "The ceiling can be overrun by the calls in flight.",
				linkCommand: LINK_COMMAND,
			};
		}

		function applied(overrides: Partial<AppliedCorpusEdit> = {}): Reply {
			return {
				status: 200,
				body: {
					previous: STARTS_FROM,
					version: NEW_VERSION,
					invalidated: 3,
					rerun: { kind: "offered", run: RUN, stage: "discuss" },
					needsComparisonManifest: false,
					...overrides,
				},
			};
		}

		function opened(bytes: Readonly<Uint8Array>): Reply {
			return {
				status: 200,
				body: Uint8Array.from(bytes),
				headers: { [CORPUS_VERSION_HEADER]: OPENED_AT },
			};
		}

		function serving(
			overrides: ReadonlyMap<string, Reply | LiveReply> = new Map(),
			linked?: OpenedCorpusFile,
			source?: { readonly run: string; readonly stage: string },
		): FakeServer {
			const server = new FakeServer(
				new Map([
					["GET /api/corpus", { status: 200, body: corpusResponseBody() }],
					[
						"GET /api/settings",
						{ status: 200, body: settingsReading("directory") },
					],
					[
						"GET /api/corpus/file",
						opened(new TextEncoder().encode("instructions\nkeep\n")),
					],
					[
						"POST /api/corpus/edits/review",
						{
							status: 200,
							body: {
								startsFrom: STARTS_FROM,
								invalidated: 3,
								applyRefusal: null,
							},
						},
					],
					["POST /api/corpus/edits/apply", applied()],
					...overrides,
				]),
			);
			server.install();
			const client = new QueryClient({
				defaultOptions: { queries: { retry: false } },
			});
			const router = createRouter({
				routeTree: createRootRoute({
					component: () => <CorpusPage opened={linked} source={source} />,
				}),
				history: createMemoryHistory({ initialEntries: ["/"] }),
			});
			render(
				<QueryClientProvider client={client}>
					<RouterProvider router={router} />
				</QueryClientProvider>,
			);

			return server;
		}

		async function editor(): Promise<HTMLElement> {
			fireEvent.click(
				await screen.findByRole("button", { name: "Edit CLAUDE.md" }),
			);

			return screen.findByRole("textbox", { name: "Text of CLAUDE.md" });
		}

		async function edited(
			text = "instructions, edited\nkeep\n",
		): Promise<void> {
			const textbox = await editor();
			await waitFor(() => {
				expect(textbox).toHaveValue("instructions\nkeep\n");
			});
			fireEvent.change(textbox, { target: { value: text } });
		}

		async function reviewed(): Promise<void> {
			await edited();
			fireEvent.click(screen.getByRole("button", { name: "Review" }));
			await screen.findByText("Marks 3 recorded results stale, none deleted");
		}

		async function appliedEdit(): Promise<void> {
			await reviewed();
			fireEvent.click(screen.getByRole("button", { name: "Apply" }));
			await screen.findByText(/Applied CLAUDE\.md/u);
		}

		it("opens the file's text as the corpus under test holds it", async () => {
			const server = serving();

			const textbox = await editor();

			await waitFor(() => {
				expect(textbox).toHaveValue("instructions\nkeep\n");
			});
			expect(
				server.sent.find(({ pathname }) => pathname === "/api/corpus/file")
					?.search,
			).toBe("?path=CLAUDE.md");
		});

		it("opens the file a link names with the lines it names selected", async () => {
			serving(new Map(), { path: "CLAUDE.md", lines: { start: 2, end: 2 } });

			const textbox = await screen.findByRole("textbox", {
				name: "Text of CLAUDE.md",
			});

			await waitFor(() => {
				expect(textbox).toHaveFocus();
			});
			const field = z.instanceof(HTMLTextAreaElement).parse(textbox);
			expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe(
				"keep\n",
			);
		});

		it("opens a directory file for reading before offering its editor", async () => {
			const server = serving();

			fireEvent.click(
				await screen.findByRole("button", { name: "View CLAUDE.md" }),
			);

			const viewer = await screen.findByRole("region", {
				name: "Instruction text · CLAUDE.md",
			});
			expect(
				await within(viewer).findByText(/instructions/u),
			).toBeInTheDocument();
			expect(
				screen.queryByRole("textbox", { name: "Text of CLAUDE.md" }),
			).not.toBeInTheDocument();
			fireEvent.click(
				within(viewer).getByRole("button", { name: "Edit this file" }),
			);
			expect(
				await screen.findByRole("textbox", { name: "Text of CLAUDE.md" }),
			).toHaveValue("instructions\nkeep\n");
			expect(server.posted("/api/corpus/edits/apply")).toHaveLength(0);
		});

		it("moves focus to the selected file’s text", async () => {
			serving();

			const textbox = await editor();

			await waitFor(() => {
				expect(textbox).toHaveFocus();
			});
		});

		it("keeps a byte order mark, so an apply writes it back", async () => {
			serving(
				new Map([
					[
						"GET /api/corpus/file",
						// TextEncoder writes U+FEFF as the three bytes of a UTF-8 mark.
						opened(new TextEncoder().encode("\uFEFFa\n")),
					],
				]),
			);

			const textbox = await editor();

			await waitFor(() => {
				expect(textbox).toHaveValue("\uFEFFa\n");
			});
		});

		it("refuses to open a file with carriage returns, since the text box would drop them", async () => {
			serving(
				new Map([
					[
						"GET /api/corpus/file",
						opened(new TextEncoder().encode("a\r\nb\r\n")),
					],
				]),
			);

			fireEvent.click(
				await screen.findByRole("button", { name: "Edit CLAUDE.md" }),
			);

			expect(await screen.findByRole("alert")).toHaveTextContent(
				"Could not read CLAUDE.md: CLAUDE.md has carriage returns",
			);
		});

		it("says a file holding too many lines cannot be diffed here", async () => {
			serving(
				new Map([
					[
						"GET /api/corpus/file",
						opened(new TextEncoder().encode("line\n".repeat(2001))),
					],
				]),
			);

			await editor();

			expect(
				await screen.findByText("CLAUDE.md holds too many lines to diff here."),
			).toBeInTheDocument();
		});

		it("refuses to open a file whose bytes are not UTF-8 text, since saving it would rewrite them", async () => {
			serving(
				new Map([
					[
						"GET /api/corpus/file",
						// "i", a byte no UTF-8 sequence holds, and a newline.
						opened(Uint8Array.of(105, 255, 10)),
					],
				]),
			);

			fireEvent.click(
				await screen.findByRole("button", { name: "Edit CLAUDE.md" }),
			);

			expect(await screen.findByRole("alert")).toHaveTextContent(
				/Could not read CLAUDE\.md/u,
			);
			expect(
				screen.queryByRole("textbox", { name: "Text of CLAUDE.md" }),
			).toBeNull();
		});

		it("shows a line diff of the change against the file's bytes", async () => {
			serving();

			await edited();

			const diff = await screen.findByRole("list", {
				name: "Changes to CLAUDE.md",
			});
			expect(
				within(diff)
					.getAllByRole("listitem")
					.map((line) => line.textContent),
			).toEqual(["1− instructions", "1+ instructions, edited", "2  keep"]);
		});

		it("names the starting version and how many recorded results it would mark stale before applying", async () => {
			const server = serving();

			await reviewed();

			expect(screen.getByText(/^Starts from/u)).toHaveTextContent(
				"Starts from corpus@a41c7e",
			);
			expect(
				screen.getByText("Marks 3 recorded results stale, none deleted"),
			).toBeInTheDocument();
			expect(
				JSON.parse(server.posted("/api/corpus/edits/review")[0]?.body ?? ""),
			).toEqual({
				path: "CLAUDE.md",
				text: "instructions, edited\nkeep\n",
				startsFrom: OPENED_AT,
			});
			expect(server.posted("/api/corpus/edits/apply")).toEqual([]);
		});

		it("says Apply waits for the launches it started, never for a replay started from a terminal", async () => {
			serving();

			await reviewed();

			expect(
				screen.getByText(
					"Apply refuses while a launch this server started runs. A replay started from a terminal is not seen, so an apply during one records a version its session did not read.",
				),
			).toBeInTheDocument();
		});

		it("asks for a new review once the text changes after one", async () => {
			serving();
			await reviewed();

			fireEvent.change(
				screen.getByRole("textbox", { name: "Text of CLAUDE.md" }),
				{ target: { value: "instructions, again\nkeep\n" } },
			);

			expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
			expect(
				screen.getByRole("button", { name: "Review" }),
			).toBeInTheDocument();
		});

		describe("when a recorded step is the source", () => {
			const source = { run: RUN, stage: "discuss" } as const;

			function sourceRun(): RunRecord {
				return {
					...runRecord({
						run: RUN,
						running: "discuss",
						stages: [
							recordStage("plan", {
								status: "graded",
								checkpoint: "recorded",
								checkpointShortId: {
									state: "available",
									shortId: "s1",
								},
							}),
							recordStage("discuss", {
								status: "graded",
								corpusVersion: { kind: "version", digest: OPENED_AT },
								readManifest: {
									state: "available",
									entries: [
										{
											path: "CLAUDE.md",
											half: "corpus",
											role: "global instructions",
											evidence: "observed",
											sha256: "0".repeat(64),
										},
									],
								},
							}),
						],
					}),
					finalOutcome: { status: "JUDGED", verdict: "PASS" },
				};
			}

			function servingSource(
				overrides: ReadonlyMap<string, Reply | LiveReply> = new Map(),
			): FakeServer {
				return serving(
					new Map([
						[`GET /api/runs/${RUN}`, { status: 200, body: sourceRun() }],
						...overrides,
					]),
					{ path: "CLAUDE.md" },
					source,
				);
			}

			async function applySourceEdit(): Promise<void> {
				const field = await screen.findByRole("textbox", {
					name: "Text of CLAUDE.md",
				});
				fireEvent.change(field, {
					target: { value: "instructions, edited\nkeep\n" },
				});
				fireEvent.click(screen.getByRole("button", { name: "Review" }));
				await screen.findByText("Marks 3 recorded results stale, none deleted");
				fireEvent.click(screen.getByRole("button", { name: "Apply" }));
				await screen.findByText(/Applied CLAUDE\.md/u);
			}

			it("keeps a source-read error explicit after apply", async () => {
				servingSource(
					new Map([
						[
							`GET /api/runs/${RUN}`,
							{ status: 404, body: { error: "source unavailable" } },
						],
					]),
				);
				await applySourceEdit();
				expect(
					screen.getAllByText(/Could not read the saved run/u),
				).toHaveLength(2);
				expect(
					screen.queryByText(/Saved source evidence is loading/u),
				).not.toBeInTheDocument();
			});

			it("keeps the saved source and current corpus distinct through review and apply", async () => {
				servingSource();

				const context = await screen.findByRole("region", {
					name: "Instruction test source",
				});
				expect(context).toHaveTextContent("corpus@c63e9a");
				expect(context).toHaveTextContent("plan checkpoint");
				expect(context).toHaveTextContent("current linked corpus@a41c7e");
				await applySourceEdit();

				expect(context).toHaveTextContent("corpus@c63e9a");
				expect(context).toHaveTextContent("current linked corpus@a41c7e");
				expect(
					within(context).getByRole("link", {
						name: "Return to source results",
					}),
				).toHaveAttribute("href", `/runs/${RUN}?view=results&step=discuss`);
			});

			it("offers three attempts from the selected step even when apply suggests another run", async () => {
				const server = servingSource(
					new Map([
						[
							"POST /api/corpus/edits/apply",
							applied({
								rerun: {
									kind: "offered",
									run: "unrelated-run",
									stage: "build",
								},
							}),
						],
						[
							"GET /api/cases",
							{ status: 200, body: { cases: [], unreadable: [] } },
						],
						["POST /api/launches", { status: 202, body: { id: "launch-1" } }],
					]),
				);

				await applySourceEdit();
				fireEvent.click(
					screen.getByRole("button", { name: "Replay discuss · 3 attempts" }),
				);
				const start = await screen.findByRole("button", { name: /^Start · /u });
				await waitFor(() => {
					expect(start).toBeEnabled();
				});
				fireEvent.click(start);

				await waitFor(() => {
					expect(server.posted("/api/launches")).toHaveLength(1);
				});
				expect(
					JSON.parse(server.posted("/api/launches")[0]?.body ?? ""),
				).toEqual({
					kind: "replay",
					run: RUN,
					stage: "discuss",
					attempts: 3,
				});
			});

			it("withholds replay when the source step has no starting checkpoint", async () => {
				const saved = sourceRun();
				servingSource(
					new Map([
						[
							`GET /api/runs/${RUN}`,
							{
								status: 200,
								body: {
									...saved,
									stages: [
										{ ...saved.stages[0], checkpoint: "missing" },
										saved.stages[1],
									],
								},
							},
						],
					]),
				);

				await applySourceEdit();

				expect(
					screen.getAllByText("discuss has no checkpoint to replay from"),
				).toHaveLength(2);
				expect(
					screen.queryByRole("button", { name: /Replay discuss/u }),
				).toBeNull();
			});

			it("withholds replay until the selected source step has ended", async () => {
				const saved = sourceRun();
				servingSource(
					new Map([
						[
							`GET /api/runs/${RUN}`,
							{
								status: 200,
								body: {
									...saved,
									stages: [
										saved.stages[0],
										{ ...saved.stages[1], status: "running" },
									],
								},
							},
						],
					]),
				);

				await applySourceEdit();

				expect(
					screen.getAllByText("discuss has no completed step record to replay"),
				).toHaveLength(2);
				expect(
					screen.queryByRole("button", { name: /Replay discuss/u }),
				).toBeNull();
			});

			it("withholds replay while the saved source run is still active", async () => {
				const saved = sourceRun();
				servingSource(
					new Map([
						[
							`GET /api/runs/${RUN}`,
							{
								status: 200,
								body: {
									...saved,
									finalOutcome: { status: "PENDING", stage: "discuss" },
								},
							},
						],
					]),
				);

				await applySourceEdit();

				expect(
					screen.getAllByText(
						"Wait for the source run to end before replaying a step",
					),
				).toHaveLength(2);
				expect(
					screen.queryByRole("button", { name: /Replay discuss/u }),
				).toBeNull();
			});

			it("withholds replay when the selected file is absent from that step's corpus reads", async () => {
				const saved = sourceRun();
				servingSource(
					new Map([
						[
							`GET /api/runs/${RUN}`,
							{
								status: 200,
								body: {
									...saved,
									stages: [
										saved.stages[0],
										{
											...saved.stages[1],
											readManifest: { state: "available", entries: [] },
										},
									],
								},
							},
						],
					]),
				);

				await applySourceEdit();

				expect(
					screen.getAllByText(
						"CLAUDE.md is not recorded as read from the corpus by this step.",
					),
				).toHaveLength(2);
				expect(
					screen.queryByRole("button", { name: /Replay discuss/u }),
				).toBeNull();
			});

			it("withholds replay when a first step's initial checkpoint is not retained", async () => {
				const saved = sourceRun();
				servingSource(
					new Map([
						[
							`GET /api/runs/${RUN}`,
							{
								status: 200,
								body: { ...saved, stages: [saved.stages[1]] },
							},
						],
					]),
				);

				await applySourceEdit();

				expect(
					screen.getAllByText(
						"The initial checkpoint is not retained for this step",
					),
				).toHaveLength(2);
				expect(
					screen.queryByRole("button", { name: /Replay discuss/u }),
				).toBeNull();
			});

			it("offers replay of a retained initial checkpoint without a short ID", async () => {
				const saved = sourceRun();
				servingSource(
					new Map([
						[
							`GET /api/runs/${RUN}`,
							{
								status: 200,
								body: {
									...saved,
									stages: [
										{
											...saved.stages[1],
											artifactsIn: {
												entries: [
													{
														from: "upstream checkpoint",
														upstream: "initial",
														target: "acme-api",
														checkpointShortId: {
															state: "unavailable",
															reasons: ["older record"],
														},
													},
												],
												missing: [],
											},
										},
									],
								},
							},
						],
					]),
				);

				await applySourceEdit();

				expect(
					screen.getByRole("button", { name: "Replay discuss · 3 attempts" }),
				).toBeInTheDocument();
			});

			it("clears the source when editing a different corpus file", async () => {
				servingSource(
					new Map([
						[
							"GET /api/corpus",
							{
								status: 200,
								body: {
									...corpusResponseBody(),
									files: [
										...corpusResponseBody().files,
										{
											path: "skills/other/SKILL.md",
											sha256: "1".repeat(64),
											lastEditedAt: "2026-09-04T09:41:00.000Z",
											lines: 1,
											readBy: 0,
											invalidated: 0,
										},
									],
								},
							},
						],
					]),
				);
				await screen.findByRole("region", { name: "Instruction test source" });

				fireEvent.click(
					screen.getByRole("button", { name: "Edit skills/other/SKILL.md" }),
				);

				expect(
					screen.queryByRole("region", { name: "Instruction test source" }),
				).toBeNull();
				expect(
					await screen.findByRole("textbox", {
						name: "Text of skills/other/SKILL.md",
					}),
				).toBeInTheDocument();
			});
		});

		it("applies the reviewed text from the reviewed version and shows the new version", async () => {
			const server = serving();

			await appliedEdit();

			expect(
				JSON.parse(server.posted("/api/corpus/edits/apply")[0]?.body ?? ""),
			).toEqual({
				path: "CLAUDE.md",
				text: "instructions, edited\nkeep\n",
				startsFrom: STARTS_FROM,
			});
			expect(screen.getByText("corpus@b52d8f")).toBeInTheDocument();
			expect(
				screen.getByText("Marked 3 recorded results stale, none deleted"),
			).toBeInTheDocument();
		});

		it("shows the applied edit's invalidated results on the card and in the file's row without a reload", async () => {
			let appliedYet = false;
			const measured: CorpusResponse = {
				...corpusResponseBody(),
				digest: NEW_VERSION,
				files: [
					{
						path: "CLAUDE.md",
						sha256: "1".repeat(64),
						lastEditedAt: "2026-09-04T09:41:00.000Z",
						lines: 1,
						readBy: 23,
						invalidated: 3,
					},
				],
				lastEdit: {
					kind: "measured",
					previous: STARTS_FROM,
					current: NEW_VERSION,
					count: 3,
					rows: ["run:a", "run:b", "run:c"],
				},
			};
			serving(
				new Map([
					[
						"GET /api/corpus",
						new LiveReply(() => ({
							status: 200,
							body: appliedYet ? measured : corpusResponseBody(),
						})),
					],
					[
						"POST /api/corpus/edits/apply",
						new LiveReply(() => {
							appliedYet = true;

							return applied();
						}),
					],
				]),
			);

			await appliedEdit();

			const card = screen.getByRole("region", {
				name: "Invalidated by the last edit",
			});
			await waitFor(() => {
				expect(card).toHaveTextContent("3 recorded results · review them");
			});
			const row = screen.getByText("CLAUDE.md").closest("tr");
			expect(row).not.toBeNull();
			expect(
				within(row ?? document.body)
					.getAllByRole("cell")
					.map(({ textContent }) => textContent),
			).toContain("⚠ 3 results");
		});

		it("asks a direct corpus edit to choose its source in Runs", async () => {
			const server = serving();

			await appliedEdit();

			expect(
				screen.getByRole("link", { name: "Choose a source step in Runs" }),
			).toHaveAttribute("href", "/");
			expect(
				screen.queryByRole("button", { name: /Replay discuss/u }),
			).toBeNull();
			expect(server.posted("/api/launches")).toEqual([]);
		});

		it("says why it offers no replay when none can settle the edit", async () => {
			serving(
				new Map([
					[
						"POST /api/corpus/edits/apply",
						applied({
							rerun: { kind: "none", reason: "No result read CLAUDE.md" },
						}),
					],
				]),
			);

			await appliedEdit();

			expect(screen.getByText("No result read CLAUDE.md")).toBeInTheDocument();
			expect(screen.queryByRole("button", { name: /Replay/u })).toBeNull();
		});

		it.each([
			[true, 1],
			[false, 0],
		])(
			"says a browser comparison will need a comparison manifest only when the server says so (%p)",
			async (needed, shown) => {
				serving(
					new Map([
						[
							"POST /api/corpus/edits/apply",
							applied({ needsComparisonManifest: needed }),
						],
					]),
				);

				await appliedEdit();

				expect(screen.queryAllByText(/comparison manifest/u)).toHaveLength(
					shown,
				);
			},
		);

		it("shows a refused apply's reason and keeps the edit open", async () => {
			serving(
				new Map([
					[
						"POST /api/corpus/edits/apply",
						{
							status: 409,
							body: { error: "The edit leaves CLAUDE.md unchanged" },
						},
					],
				]),
			);
			await reviewed();

			fireEvent.click(screen.getByRole("button", { name: "Apply" }));

			expect(
				await screen.findByText("The edit leaves CLAUDE.md unchanged"),
			).toBeInTheDocument();
			expect(
				screen.getByRole("textbox", { name: "Text of CLAUDE.md" }),
			).toHaveValue("instructions, edited\nkeep\n");
			expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
			expect(
				screen.getByRole("button", { name: "Review" }),
			).toBeInTheDocument();
		});

		it("reads the file again after a refused review, keeping the edit", async () => {
			const server = serving(
				new Map([
					[
						"POST /api/corpus/edits/review",
						{
							status: 409,
							body: {
								error:
									"The linked directory changed after CLAUDE.md was opened",
							},
						},
					],
				]),
			);
			await edited();

			fireEvent.click(screen.getByRole("button", { name: "Review" }));

			expect(
				await screen.findByText(
					"The linked directory changed after CLAUDE.md was opened",
				),
			).toBeInTheDocument();
			await waitFor(() => {
				expect(
					server.sent.filter(({ pathname }) => pathname === "/api/corpus/file"),
				).toHaveLength(2);
			});
			expect(
				screen.getByRole("textbox", { name: "Text of CLAUDE.md" }),
			).toHaveValue("instructions, edited\nkeep\n");
		});

		it("shows a review's apply refusal and offers no Apply", async () => {
			serving(
				new Map([
					[
						"POST /api/corpus/edits/review",
						{
							status: 200,
							body: {
								startsFrom: STARTS_FROM,
								invalidated: 3,
								applyRefusal:
									"The linked corpus directory resolves into the live install",
							},
						},
					],
				]),
			);

			await reviewed();

			expect(
				screen.getByText(
					"The linked corpus directory resolves into the live install",
				),
			).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
		});

		it("closes the edit on Discard and writes nothing", async () => {
			const server = serving();
			await reviewed();

			fireEvent.click(screen.getByRole("button", { name: "Discard" }));

			expect(
				screen.queryByRole("textbox", { name: "Text of CLAUDE.md" }),
			).toBeNull();
			expect(server.posted("/api/corpus/edits/apply")).toEqual([]);
		});

		describe("when the live install is linked", () => {
			it("opens a live file for reading, preserves CRLF bytes in raw mode and offers no write action", async () => {
				const text = "# Instruction\r\nkeep this line\r\n";
				const server = serving(
					new Map([
						[
							"GET /api/settings",
							{ status: 200, body: settingsReading("live") },
						],
						["GET /api/corpus/file", opened(new TextEncoder().encode(text))],
					]),
				);

				fireEvent.click(
					await screen.findByRole("button", { name: "View CLAUDE.md" }),
				);

				const viewer = await screen.findByRole("region", {
					name: "Instruction text · CLAUDE.md",
				});
				expect(
					await within(viewer).findByRole("heading", { name: "Instruction" }),
				).toBeInTheDocument();
				fireEvent.click(within(viewer).getByRole("button", { name: "Raw" }));
				expect(viewer.querySelector("pre")?.textContent).toBe(text);
				expect(within(viewer).getByText("corpus@c63e9a")).toBeInTheDocument();
				expect(
					screen.queryByRole("textbox", { name: "Text of CLAUDE.md" }),
				).not.toBeInTheDocument();
				expect(
					screen.queryByRole("button", { name: /^(?:Edit|Review|Apply)/u }),
				).not.toBeInTheDocument();
				expect(server.posted("/api/corpus/edits/review")).toHaveLength(0);
				expect(server.posted("/api/corpus/edits/apply")).toHaveLength(0);
				expect(
					server.sent.find(({ pathname }) => pathname === "/api/corpus/file")
						?.search,
				).toBe("?path=CLAUDE.md");
			});

			it.each([
				[
					"invalid UTF-8",
					{
						status: 200,
						body: Uint8Array.of(255),
						headers: { [CORPUS_VERSION_HEADER]: OPENED_AT },
					},
					"is not UTF-8 text",
				],
				[
					"missing version",
					{ status: 200, body: new TextEncoder().encode("instruction") },
					"without the corpus version",
				],
				[
					"unlisted path",
					{
						status: 404,
						body: { error: "The corpus report lists no file CLAUDE.md" },
					},
					"lists no file CLAUDE.md",
				],
			] as const)(
				"keeps %s explicit in the read-only viewer",
				async (_name, reply, reason) => {
					const server = serving(
						new Map<string, Reply>([
							[
								"GET /api/settings",
								{ status: 200, body: settingsReading("live") },
							],
							["GET /api/corpus/file", reply],
						]),
						{ path: "CLAUDE.md" },
					);

					const refusal = await screen.findByRole("alert");

					expect(refusal).toHaveTextContent(reason);
					expect(
						screen.queryByRole("button", { name: "Raw" }),
					).not.toBeInTheDocument();
					expect(server.posted("/api/corpus/edits/apply")).toHaveLength(0);
				},
			);

			it("offers no Edit and names the command that links a copy", async () => {
				serving(
					new Map([
						[
							"GET /api/settings",
							{ status: 200, body: settingsReading("live") },
						],
					]),
				);

				expect(await screen.findByText(LINK_COMMAND)).toBeInTheDocument();
				expect(screen.queryByRole("button", { name: /^Edit/u })).toBeNull();
			});
		});
	});

	describe("when the report carries a refusal", () => {
		function renderRefusing(
			files: CorpusResponse["files"],
			refusals: CorpusResponse["refusals"] = [
				"agents/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
			],
		): void {
			const body: CorpusResponse = {
				root: "/home/user/.claude",
				digest: undefined,
				files,
				refusals,
				lastEdit: {
					kind: "not-recorded",
					reason:
						"the corpus under test has no earlier version in its log to compare against",
				},
			};
			stubFetchByPath(
				new Map<string, unknown>([
					["/api/corpus", body],
					["/api/settings", LIVE_SETTINGS],
				]),
			);
			const client = new QueryClient({
				defaultOptions: { queries: { retry: false } },
			});
			renderWithRouter(
				<QueryClientProvider client={client}>
					<CorpusPage />
				</QueryClientProvider>,
			);
		}

		it("says what was left out without calling every refusal a layout directory, since CLAUDE.md is not one", async () => {
			renderRefusing(corpusResponseBody().files);

			await waitFor(() => {
				expect(
					screen.getByText(
						"These entries could not be hashed, so they are missing from the table, and a refused layout directory is missing from it whole:",
					),
				).toBeInTheDocument();
			});
		});

		it("renders the files it could hash alongside the refusal, rather than one failure line", async () => {
			renderRefusing(corpusResponseBody().files);

			await waitFor(() => {
				expect(screen.getByText("CLAUDE.md")).toBeInTheDocument();
			});
			expect(
				within(screen.getByRole("alert")).getByText(
					/agents\/escape\.md resolves outside the tree/u,
				),
			).toBeInTheDocument();
			expect(screen.queryByText("Could not load the corpus.")).toBeNull();
		});

		it("renders no corpus version, since the report carries none for a partial tree", async () => {
			renderRefusing(corpusResponseBody().files);

			await waitFor(() => {
				expect(screen.getByText("CLAUDE.md")).toBeInTheDocument();
			});
			expect(screen.queryByText(/corpus@/u)).toBeNull();
		});

		it("renders every refusal, so a benign entry sorting first cannot hide a hostile one", async () => {
			renderRefusing(corpusResponseBody().files, [
				"agents/aardvark.md is a link whose target is missing, so the bytes it names cannot be read",
				"agents/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
			]);

			const alert = await screen.findByRole("alert");

			expect(within(alert).getAllByRole("listitem")).toHaveLength(2);
			expect(
				within(alert).getByText(
					/agents\/escape\.md resolves outside the tree/u,
				),
			).toBeInTheDocument();
		});

		it("renders the refusal rather than the empty state when no layout directory hashed", async () => {
			renderRefusing([]);

			await waitFor(() => {
				expect(
					screen.getByText(/agents\/escape\.md resolves outside the tree/u),
				).toBeInTheDocument();
			});
			expect(screen.queryByText("No corpus files found")).toBeNull();
		});
	});

	describe("when the last edit was measured", () => {
		const PREVIOUS = `e73e56${"0".repeat(58)}`;
		const CURRENT = `a41c7e${"0".repeat(58)}`;

		function measuredCorpus(
			rows: readonly string[],
			invalidated: number,
		): CorpusResponse {
			return {
				...corpusResponseBody(),
				digest: CURRENT,
				files: [
					{
						path: "CLAUDE.md",
						sha256: "0".repeat(64),
						lastEditedAt: "2026-09-04T09:41:00.000Z",
						lines: 1,
						readBy: 23,
						invalidated,
					},
				],
				lastEdit: {
					kind: "measured",
					previous: PREVIOUS,
					current: CURRENT,
					count: rows.length,
					rows,
				},
			};
		}

		it("counts the recorded results it invalidated and links to them in run history", async () => {
			renderAppWithStub(
				"/corpus",
				new Map<string, unknown>([
					[
						"/api/corpus",
						measuredCorpus(
							["run:2026-09-12T00-00-00.000Z", "group:group-a"],
							2,
						),
					],
					["/api/settings", LIVE_SETTINGS],
				]),
			);

			const card = await screen.findByRole("region", {
				name: "Invalidated by the last edit",
			});

			expect(within(card).getByText(/2 recorded results/u)).toBeInTheDocument();
			expect(
				within(card).getByRole("link", { name: "review them" }),
			).toHaveAttribute("href", `/?invalidatedBy=${PREVIOUS}..${CURRENT}`);
		});

		it("says no recorded result was invalidated and names the version the edit started from", async () => {
			renderAppWithStub(
				"/corpus",
				new Map<string, unknown>([
					["/api/corpus", measuredCorpus([], 0)],
					["/api/settings", LIVE_SETTINGS],
				]),
			);

			const card = await screen.findByRole("region", {
				name: "Invalidated by the last edit",
			});

			expect(card).toHaveTextContent(
				"No recorded result invalidated by the edit from corpus@e73e56",
			);
			expect(within(card).queryByRole("link")).toBeNull();
		});

		it("explains why a file's prior-version count can exceed results newly invalidated by the last edit", async () => {
			renderAppWithStub(
				"/corpus",
				new Map<string, unknown>([
					["/api/corpus", measuredCorpus([], 23)],
					["/api/settings", LIVE_SETTINGS],
				]),
			);

			const card = await screen.findByRole("region", {
				name: "Invalidated by the last edit",
			});
			const file = await screen.findByRole("button", {
				name: "View CLAUDE.md",
			});

			expect(card).toHaveTextContent("No recorded result invalidated");
			expect(file.closest("tr")).toHaveTextContent("23 results");
			expect(
				screen.getByRole("columnheader", { name: "Prior-version results" }),
			).toBeInTheDocument();
			fireEvent.click(
				screen.getByText("What do Read by and prior-version counts mean?"),
			);
			expect(
				screen.getByText(
					/These rows can include results already stale before the last edit/u,
				),
			).toBeVisible();
			expect(screen.getByText(/This includes declared capture/u)).toBeVisible();
		});

		it.each([
			[0, "✓ 0 results"],
			[1, "⚠ 1 result"],
			[23, "⚠ 23 results"],
		])(
			"reads %d invalidated results of a file as %s",
			async (invalidated, expected) => {
				renderAppWithStub(
					"/corpus",
					new Map<string, unknown>([
						["/api/corpus", measuredCorpus([], invalidated)],
						["/api/settings", LIVE_SETTINGS],
					]),
				);

				const path = await screen.findByText("CLAUDE.md");
				const row = path.closest("tr");

				expect(row).not.toBeNull();
				expect(
					within(row ?? document.body)
						.getAllByRole("cell")
						.map(({ textContent }) => textContent),
				).toContain(expected);
			},
		);
	});

	describe("when the last edit is not recorded", () => {
		it("shows the server's reason on the card and reads no file as 0 results", async () => {
			renderAppWithStub(
				"/corpus",
				new Map<string, unknown>([
					["/api/corpus", corpusResponseBody()],
					["/api/settings", LIVE_SETTINGS],
				]),
			);

			const card = await screen.findByRole("region", {
				name: "Invalidated by the last edit",
			});

			expect(card).toHaveTextContent(
				"Not recorded: the corpus under test has no earlier version in its log to compare against",
			);
			expect(
				screen.getByRole("columnheader", { name: "Prior-version results" }),
			).toBeInTheDocument();
			expect(screen.queryByText(/0 results/u)).toBeNull();
		});
	});

	it("renders the empty state instead of a table when the corpus tree holds no files", async () => {
		const empty: CorpusResponse = {
			...corpusResponseBody(),
			digest: "e3b0c4",
			files: [],
		};
		stubFetchByPath(new Map([["/api/corpus", empty]]));
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		renderWithRouter(
			<QueryClientProvider client={client}>
				<CorpusPage />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("No corpus files found")).toBeInTheDocument();
		});
		expect(screen.queryByRole("table")).not.toBeInTheDocument();
	});
});
