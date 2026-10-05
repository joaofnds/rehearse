import { afterEach, describe, expect, it } from "bun:test";
import type { MatcherFunction } from "@testing-library/react";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CorpusResponse } from "#client/corpus/corpus-query";
import type { SettingsReading } from "#client/launch/settings-query";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import { LiveReply } from "#client/test-support/live-reply";
import { runRow } from "#client/test-support/runs-in-flight";
import { SettingsPage } from "./settings-page";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const LIVE_ROOT = "/home/operator/.claude";

const LIVE_SETTINGS: SettingsReading = {
	spendCeilingUsd: null,
	setCommand: "rehearse settings --spend-ceiling-usd <USD>",
	recordsDirectory: "/home/operator/.rehearse/runs",
	linkedCorpus: { kind: "live", root: LIVE_ROOT },
	overrun:
		"A call already in flight when the ceiling is reached still lands, so a run can overrun it.",
	linkCommand: "rehearse settings --link-corpus <directory>",
};

function history(runs: number): RunHistoryResponse {
	return {
		rows: Array.from({ length: runs }, (_unused, index) =>
			runRow({ run: `2026-10-0${String(index + 1)}T10-00-00.000Z` }),
		),
		launches: [],
		unreadable: [],
	};
}

function corpus(digest: string | undefined): CorpusResponse {
	return {
		root: LIVE_ROOT,
		digest,
		files: [],
		refusals: [],
		lastEdit: {
			kind: "not-recorded",
			reason:
				"the corpus under test has no earlier version in its log to compare against",
		},
	};
}

/** The screen's subline, whose path sits in a span of its own. */
function subline(text: string): MatcherFunction {
	return (_content, element) =>
		element?.tagName === "P" && element.textContent === text;
}

const RECORDS_AT = "Local install · records at /home/operator/.rehearse/runs";

function serving(
	overrides: ReadonlyMap<string, Reply | LiveReply> = new Map(),
): FakeServer {
	const server = new FakeServer(
		new Map([
			["GET /api/settings", { status: 200, body: LIVE_SETTINGS }],
			[
				"GET /api/settings/records",
				{ status: 200, body: { bytes: 612_000_000 } },
			],
			["GET /api/runs", { status: 200, body: history(2) }],
			[
				"GET /api/corpus",
				{ status: 200, body: corpus(`a41c7e${"0".repeat(58)}`) },
			],
			...overrides,
		]),
	);
	server.install();
	render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<SettingsPage />
		</QueryClientProvider>,
	);

	return server;
}

describe(SettingsPage.name, () => {
	it("names the records location, how many records it holds and their size", async () => {
		serving();

		expect(
			await screen.findByText(subline(`${RECORDS_AT} · 2 records, 612 MB`)),
		).toBeInTheDocument();
	});

	it("offers no control that edits the records location", async () => {
		serving();

		await screen.findByText(subline(`${RECORDS_AT} · 2 records, 612 MB`));

		expect(screen.queryByRole("textbox", { name: /records/iu })).toBeNull();
	});

	it.each([
		[0, "0 B"],
		[999, "999 B"],
		[1499, "1 kB"],
		[999_600, "1 MB"],
		[2_500_000, "3 MB"],
		[999_600_000, "1 GB"],
		[1_200_000_000, "1 GB"],
	])("sizes %p bytes as %p", async (bytes, shown) => {
		serving(
			new Map([
				["GET /api/settings/records", { status: 200, body: { bytes } }],
			]),
		);

		expect(
			await screen.findByText(subline(`${RECORDS_AT} · 2 records, ${shown}`)),
		).toBeInTheDocument();
	});

	describe("when the records size cannot be read", () => {
		it("shows an answer the route does not declare as the server sent it", async () => {
			serving(
				new Map([
					[
						"GET /api/settings/records",
						{
							status: 500,
							body: new TextEncoder().encode("Internal Server Error"),
						},
					],
				]),
			);

			expect(
				await screen.findByText(
					subline(`${RECORDS_AT} · 2 records · Internal Server Error`),
				),
			).toBeInTheDocument();
		});

		it("says why beside the location", async () => {
			serving(
				new Map([
					[
						"GET /api/settings/records",
						{
							status: 409,
							body: {
								error:
									"Could not measure the records directory, because locked could not be read (EACCES)",
							},
						},
					],
				]),
			);

			expect(
				await screen.findByText(
					subline(
						`${RECORDS_AT} · 2 records · Could not measure the records directory, because locked could not be read (EACCES)`,
					),
				),
			).toBeInTheDocument();
		});
	});

	describe("the Spend limit card", () => {
		function card(): Promise<HTMLElement> {
			return screen.findByRole("region", { name: "Spend limit" });
		}

		const STORED: SettingsReading = { ...LIVE_SETTINGS, spendCeilingUsd: 2.5 };

		it("leaves the limit empty while no ceiling is stored", async () => {
			serving();

			expect(
				within(await card()).getByLabelText("Spend limit per run"),
			).toHaveValue("");
		});

		it("shows a stored ceiling to the cent", async () => {
			serving(new Map([["GET /api/settings", { status: 200, body: STORED }]]));
			const limit = within(await card()).getByLabelText("Spend limit per run");

			await waitFor(() => {
				expect(limit).toHaveValue("2.50");
			});
		});

		it.each([
			[0.125, "0.125"],
			[0.0000001, "0.0000001"],
		])(
			"shows a stored ceiling finer than a cent, %p, unrounded and storable",
			async (spendCeilingUsd, shown) => {
				serving(
					new Map([
						[
							"GET /api/settings",
							{ status: 200, body: { ...LIVE_SETTINGS, spendCeilingUsd } },
						],
					]),
				);
				const spendLimit = await card();
				const limit = within(spendLimit).getByLabelText("Spend limit per run");

				await waitFor(() => {
					expect(limit).toHaveValue(shown);
				});
				expect(within(spendLimit).queryByRole("alert")).toBeNull();
			},
		);

		it("stores the entered limit and shows it as stored", async () => {
			const server = serving(
				new Map([
					["PUT /api/settings/spend-ceiling", { status: 200, body: STORED }],
				]),
			);
			const spendLimit = await card();
			const limit = within(spendLimit).getByLabelText("Spend limit per run");

			fireEvent.change(limit, { target: { value: "2.50" } });
			fireEvent.click(
				within(spendLimit).getByRole("button", { name: "Store limit" }),
			);

			await waitFor(() => {
				expect(
					server.sent
						.filter((request) => request.method === "PUT")
						.map((request) => [request.pathname, request.body]),
				).toEqual([
					["/api/settings/spend-ceiling", JSON.stringify({ usd: 2.5 })],
				]);
			});
			await waitFor(() => {
				expect(limit).toHaveValue("2.50");
			});
		});

		it("carries the design's copy, the group ceiling and the overrun statement", async () => {
			serving();
			const spendLimit = await card();

			expect(
				within(spendLimit).getByText(
					"Enforced per run and per group. A run cannot start without one and stops mid-step when reached.",
				),
			).toBeInTheDocument();
			expect(within(spendLimit).getByText("USD per run")).toBeInTheDocument();
			expect(
				within(spendLimit).getByText("Group ceiling: attempts × per-run"),
			).toBeInTheDocument();
			expect(
				await within(spendLimit).findByText(LIVE_SETTINGS.overrun),
			).toBeInTheDocument();
		});

		describe("when the entry is not a positive amount", () => {
			it.each(["0", "abc", "1e3", "-2"])(
				"stores nothing for %p and says why",
				async (entered) => {
					const server = serving();
					const spendLimit = await card();

					fireEvent.change(
						within(spendLimit).getByLabelText("Spend limit per run"),
						{ target: { value: entered } },
					);
					fireEvent.click(
						within(spendLimit).getByRole("button", { name: "Store limit" }),
					);

					expect(
						within(spendLimit).getByText(
							"A spend limit is a positive amount in US dollars, such as 2.50, so this one is not stored.",
						),
					).toBeInTheDocument();
					expect(
						server.sent.filter((request) => request.method === "PUT"),
					).toEqual([]);
				},
			);
		});

		describe("when the server refuses the limit", () => {
			it("shows the refusal", async () => {
				serving(
					new Map([
						[
							"PUT /api/settings/spend-ceiling",
							{
								status: 409,
								body: { error: "The settings file is unreadable" },
							},
						],
					]),
				);
				const spendLimit = await card();

				fireEvent.change(
					within(spendLimit).getByLabelText("Spend limit per run"),
					{ target: { value: "3" } },
				);
				fireEvent.click(
					within(spendLimit).getByRole("button", { name: "Store limit" }),
				);

				expect(
					await within(spendLimit).findByText(
						"The settings file is unreadable",
					),
				).toBeInTheDocument();
			});
		});
	});

	describe("the Corpus card", () => {
		const LINKED_ROOT = "/home/operator/code/omelette/.claude";
		const LINKED_DIGEST = `b52d8f${"0".repeat(58)}`;
		const LINKED_SETTINGS: SettingsReading = {
			...LIVE_SETTINGS,
			linkedCorpus: { kind: "directory", root: LINKED_ROOT },
		};

		function card(): Promise<HTMLElement> {
			return screen.findByRole("region", { name: "Corpus" });
		}

		/**
		 * A server whose settings and corpus follow the link and unlink it
		 * answers, as the real routes do.
		 */
		function linkable(
			initially: "live" | "directory",
			overrides: ReadonlyMap<string, Reply | LiveReply> = new Map(),
		): FakeServer {
			let linked = initially === "directory";
			const settings = (): SettingsReading =>
				linked ? LINKED_SETTINGS : LIVE_SETTINGS;

			return serving(
				new Map<string, Reply | LiveReply>([
					[
						"GET /api/settings",
						new LiveReply(() => ({ status: 200, body: settings() })),
					],
					[
						"GET /api/corpus",
						new LiveReply(() => ({
							status: 200,
							body: linked
								? { ...corpus(LINKED_DIGEST), root: LINKED_ROOT }
								: corpus(`a41c7e${"0".repeat(58)}`),
						})),
					],
					[
						"PUT /api/settings/corpus",
						new LiveReply(() => {
							linked = true;

							return { status: 200, body: settings() };
						}),
					],
					[
						"DELETE /api/settings/corpus",
						new LiveReply(() => {
							linked = false;

							return { status: 200, body: settings() };
						}),
					],
					...overrides,
				]),
			);
		}

		function linkDirectory(directory: string): void {
			const corpusCard = screen.getByRole("region", { name: "Corpus" });
			fireEvent.change(
				within(corpusCard).getByLabelText("Corpus directory to link"),
				{ target: { value: directory } },
			);
			fireEvent.click(within(corpusCard).getByRole("button", { name: "Link" }));
		}

		describe("when the live install is linked", () => {
			it("shows the live install's root and version, with Rehash now and a link control", async () => {
				linkable("live");
				const corpusCard = await card();

				expect(
					await within(corpusCard).findByText("corpus@a41c7e"),
				).toBeInTheDocument();
				expect(within(corpusCard).getByText(LIVE_ROOT)).toBeInTheDocument();
				expect(
					within(corpusCard).getByRole("button", { name: "Rehash now" }),
				).toBeInTheDocument();
				expect(
					within(corpusCard).getByLabelText("Corpus directory to link"),
				).toBeInTheDocument();
			});

			it("offers no Unlink corpus", async () => {
				linkable("live");
				const corpusCard = await card();

				await within(corpusCard).findByText("corpus@a41c7e");

				expect(
					within(corpusCard).queryByRole("button", { name: "Unlink corpus" }),
				).toBeNull();
			});
		});

		it("links a directory by its path and shows its root and version", async () => {
			const server = linkable("live");
			const corpusCard = await card();
			await within(corpusCard).findByText("corpus@a41c7e");

			linkDirectory("~/code/omelette/.claude");

			expect(
				await within(corpusCard).findByText("corpus@b52d8f"),
			).toBeInTheDocument();
			expect(within(corpusCard).getByText(LINKED_ROOT)).toBeInTheDocument();
			expect(
				server.sent
					.filter((request) => request.method === "PUT")
					.map((request) => request.body),
			).toEqual([JSON.stringify({ directory: "~/code/omelette/.claude" })]);
		});

		it("unlinks a linked directory, returning the card to the live install", async () => {
			linkable("directory");
			const corpusCard = await card();
			await within(corpusCard).findByText("corpus@b52d8f");

			fireEvent.click(
				within(corpusCard).getByRole("button", { name: "Unlink corpus" }),
			);

			expect(
				await within(corpusCard).findByText("corpus@a41c7e"),
			).toBeInTheDocument();
			expect(within(corpusCard).getByText(LIVE_ROOT)).toBeInTheDocument();
			expect(
				within(corpusCard).queryByRole("button", { name: "Unlink corpus" }),
			).toBeNull();
		});

		it("shows the version label the rehash answers", async () => {
			linkable(
				"directory",
				new Map([
					[
						"POST /api/settings/corpus/rehash",
						{
							status: 200,
							body: {
								label: "corpus@c63e90",
								digest: `c63e90${"0".repeat(58)}`,
							},
						},
					],
				]),
			);
			const corpusCard = await card();
			await within(corpusCard).findByText("corpus@b52d8f");

			fireEvent.click(
				within(corpusCard).getByRole("button", { name: "Rehash now" }),
			);

			expect(
				await within(corpusCard).findByText("Rehashed as corpus@c63e90"),
			).toBeInTheDocument();
		});

		describe("when a write is refused", () => {
			it.each([
				[409, "Corpus source <path>/notes holds no corpus layout entry"],
				[
					400,
					"Link a corpus directory by its absolute path, or one starting with ~/ for your home directory, because the server does not share the browser's working directory",
				],
			])(
				"shows a %p link refusal and keeps the live install",
				async (status, error) => {
					linkable(
						"live",
						new Map([
							["PUT /api/settings/corpus", { status, body: { error } }],
						]),
					);
					const corpusCard = await card();
					await within(corpusCard).findByText("corpus@a41c7e");

					linkDirectory("notes");

					expect(
						await within(corpusCard).findByText(error),
					).toBeInTheDocument();
					expect(within(corpusCard).getByText(LIVE_ROOT)).toBeInTheDocument();
				},
			);

			it("drops the version label once the corpus can no longer be read after a refused rehash", async () => {
				let rehashed = false;
				linkable(
					"directory",
					new Map<string, Reply | LiveReply>([
						[
							"POST /api/settings/corpus/rehash",
							new LiveReply(() => {
								rehashed = true;

								return {
									status: 409,
									body: {
										error: "The linked corpus directory is no longer a corpus",
									},
								};
							}),
						],
						[
							"GET /api/corpus",
							new LiveReply(() =>
								rehashed
									? {
											status: 409,
											body: {
												error:
													"The linked corpus directory <path> is no longer a corpus",
											},
										}
									: {
											status: 200,
											body: { ...corpus(LINKED_DIGEST), root: LINKED_ROOT },
										},
							),
						],
					]),
				);
				const corpusCard = await card();
				await within(corpusCard).findByText("corpus@b52d8f");

				fireEvent.click(
					within(corpusCard).getByRole("button", { name: "Rehash now" }),
				);

				expect(
					await within(corpusCard).findByText("⚠ corpus unreadable"),
				).toBeInTheDocument();
				expect(within(corpusCard).queryByText("corpus@b52d8f")).toBeNull();
			});

			it("shows the reason of an error the route does not declare", async () => {
				linkable(
					"live",
					new Map([
						[
							"PUT /api/settings/corpus",
							{
								status: 500,
								body: { error: "EACCES: permission denied, open '<path>'" },
							},
						],
					]),
				);
				const corpusCard = await card();

				fireEvent.change(
					within(corpusCard).getByLabelText("Corpus directory to link"),
					{ target: { value: "/work/corpus" } },
				);
				fireEvent.click(
					within(corpusCard).getByRole("button", { name: "Link" }),
				);

				expect(
					await within(corpusCard).findByText(
						"EACCES: permission denied, open '<path>'",
					),
				).toBeInTheDocument();
			});

			it("shows a refusal the server sends as plain text as it was sent", async () => {
				linkable(
					"directory",
					new Map([
						[
							"DELETE /api/settings/corpus",
							{
								status: 403,
								body: new TextEncoder().encode(
									"Forbidden: not a loopback host",
								),
							},
						],
					]),
				);
				const corpusCard = await card();
				await within(corpusCard).findByText("corpus@b52d8f");

				fireEvent.click(
					within(corpusCard).getByRole("button", { name: "Unlink corpus" }),
				);

				expect(
					await within(corpusCard).findByText("Forbidden: not a loopback host"),
				).toBeInTheDocument();
			});

			it("shows a rehash refusal naming how to link another or unlink", async () => {
				const refusal =
					"The linked corpus directory <path>/.claude is no longer a corpus. Link another with rehearse settings --link-corpus <directory>, or unlink it with: rehearse settings --unlink-corpus";
				linkable(
					"directory",
					new Map([
						[
							"POST /api/settings/corpus/rehash",
							{ status: 409, body: { error: refusal } },
						],
					]),
				);
				const corpusCard = await card();
				await within(corpusCard).findByText("corpus@b52d8f");

				fireEvent.click(
					within(corpusCard).getByRole("button", { name: "Rehash now" }),
				);

				expect(
					await within(corpusCard).findByText(refusal),
				).toBeInTheDocument();
			});
		});
	});

	describe("the Keyboard card", () => {
		function shortcuts(): Promise<readonly string[]> {
			return screen
				.findByRole("region", { name: "Keyboard" })
				.then((keyboard) =>
					within(keyboard)
						.getAllByRole("listitem")
						.map((item) => item.textContent),
				);
		}

		it("lists the design's eight shortcuts in its order, marking the unbound ones planned", async () => {
			serving();

			expect(await shortcuts()).toEqual([
				"g rrun history",
				"g mlive monitor",
				"nnew run planned",
				"rreplay a step planned",
				"eexpand cited evidence planned",
				"j / kmove through rows",
				"ffollow / unfollow the tail",
				"Escclose dialog",
			]);
		});
	});
});
