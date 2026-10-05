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
	overrides: ReadonlyMap<string, Reply> = new Map(),
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
		[2_500_000, "3 MB"],
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
});
