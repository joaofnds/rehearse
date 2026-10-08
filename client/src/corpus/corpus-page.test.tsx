import { afterEach, describe, expect, it } from "bun:test";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import type { apiClient, launchClient } from "#client/api-client";
import type { AppliedCorpusEdit } from "./corpus-edit-requests";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer, stubFetchByPath } from "#client/test-support/fetch-stub";
import { CorpusPage } from "./corpus-page";
import { CORPUS_VERSION_HEADER } from "#server/corpus-version-header";

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
	render(
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
			overrides: ReadonlyMap<string, Reply> = new Map(),
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
			render(
				<QueryClientProvider client={client}>
					<CorpusPage />
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

		it("offers a replay of the stage that read the file, starting nothing", async () => {
			const server = serving();

			await appliedEdit();

			expect(
				screen.getByRole("button", { name: "Replay discuss · 3 attempts" }),
			).toBeInTheDocument();
			expect(screen.getByText(RUN, { exact: false })).toBeInTheDocument();
			expect(server.posted("/api/launches")).toEqual([]);
		});

		it("starts the offered replay with three attempts only when asked", async () => {
			const server = serving(
				new Map([
					[
						"GET /api/cases",
						{ status: 200, body: { cases: [], unreadable: [] } },
					],
					["POST /api/launches", { status: 202, body: { id: "launch-1" } }],
				]),
			);
			await appliedEdit();

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
			expect(JSON.parse(server.posted("/api/launches")[0]?.body ?? "")).toEqual(
				{
					kind: "replay",
					run: RUN,
					stage: "discuss",
					attempts: 3,
				},
			);
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
			render(
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

	it("renders the empty state instead of a table when the corpus tree holds no files", async () => {
		stubFetchByPath(
			new Map([
				[
					"/api/corpus",
					{
						root: "/home/user/.claude",
						digest: "e3b0c4",
						files: [],
						refusals: [],
					},
				],
			]),
		);
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
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
