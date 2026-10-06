import { afterEach, describe, expect, it } from "bun:test";
import { focusManager } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { CorpusResponse } from "#client/corpus/corpus-query";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { renderAppAt, SHELL_BASELINE } from "#client/test-support/render-app";
import { runRow } from "#client/test-support/runs-in-flight";
import type { RunHistoryResponse } from "./run-history-query";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	focusManager.setFocused(undefined);
});

const PREVIOUS = `e73e56${"0".repeat(58)}`;
const CURRENT = `a41c7e${"0".repeat(58)}`;
const LATER = `c09b11${"0".repeat(58)}`;

const RUN_A = "2026-09-12T00-00-00.000Z";
const RUN_B = "2026-09-13T00-00-00.000Z";
const RUN_C = "2026-09-14T00-00-00.000Z";

const LIVE_SETTINGS = {
	spendCeilingUsd: 5,
	setCommand: "rehearse settings --spend-ceiling-usd <USD>",
	recordsDirectory: "/records",
	linkedCorpus: { kind: "live", root: "/home/user/.claude" },
	overrun: "The ceiling can be overrun by the calls in flight.",
	linkCommand: "rehearse settings --link-corpus <directory>",
};

function history(
	unreadable: RunHistoryResponse["unreadable"] = [],
): RunHistoryResponse {
	return {
		rows: [RUN_C, RUN_B, RUN_A].map((run) =>
			runRow({ run, status: "COMPLETE" }),
		),
		launches: [],
		unreadable,
	};
}

/** The edit from PREVIOUS to CURRENT, which invalidated runs A and C. */
const LAST_EDIT: CorpusResponse["lastEdit"] = {
	kind: "measured",
	previous: PREVIOUS,
	current: CURRENT,
	count: 2,
	rows: [`run:${RUN_A}`, `run:${RUN_C}`],
};

function corpus(lastEdit: CorpusResponse["lastEdit"]): CorpusResponse {
	return {
		root: "/home/user/.claude",
		digest: CURRENT,
		files: [],
		refusals: [],
		lastEdit,
	};
}

interface Served {
	/** Bodies by path; a body set later answers the requests that follow. */
	readonly answers: Map<string, unknown>;
	/** Leaves the requests that follow to `path` unanswered. */
	readonly hold: (path: string) => void;
	/** How many requests were left unanswered. */
	readonly held: () => number;
}

/**
 * Serves the screen's reads, answering `failing` with a 404 and leaving
 * `pending` unanswered, so the screen's loading and failed reads are
 * observed against real requests.
 */
function serving(
	path: string,
	served: {
		readonly corpus?: CorpusResponse;
		readonly runs?: RunHistoryResponse;
		readonly failing?: string;
		readonly pending?: string;
	} = {},
): Served {
	const byPath = new Map<string, unknown>([
		...SHELL_BASELINE,
		["/api/runs", served.runs ?? history()],
		["/api/corpus", served.corpus ?? corpus(LAST_EDIT)],
		["/api/settings", LIVE_SETTINGS],
	]);
	if (served.failing !== undefined) {
		byPath.delete(served.failing);
	}
	const holding = new Set(served.pending === undefined ? [] : [served.pending]);
	let held = 0;
	stubFetchByPath(byPath);
	const answer = globalThis.fetch;
	const stub = (request: string | URL | Request): Promise<Response> => {
		const { pathname } = new URL(
			request instanceof Request ? request.url : request,
			"http://localhost",
		);
		if (!holding.has(pathname)) {
			return answer(request);
		}
		held += 1;

		return Promise.withResolvers<Response>().promise;
	};
	stub.preconnect = fetch.preconnect;
	globalThis.fetch = stub;
	renderAppAt(path);

	return {
		answers: byPath,
		hold: (heldPath) => {
			holding.add(heldPath);
		},
		held: () => held,
	};
}

function durableRecords(): Promise<HTMLElement> {
	return screen.findByRole("table", { name: "DURABLE RECORDS" });
}

describe("/?invalidatedBy", () => {
	it("lists exactly the rows the last edit invalidated after following 'review them' from the corpus screen", async () => {
		serving("/corpus");

		fireEvent.click(await screen.findByRole("link", { name: "review them" }));

		const table = await durableRecords();
		expect(within(table).getByText(RUN_A)).toBeInTheDocument();
		expect(within(table).getByText(RUN_C)).toBeInTheDocument();
		expect(within(table).queryByText(RUN_B)).toBeNull();
	});

	it("reads the last edit again on arrival, so an edit made after the corpus screen loaded is not taken for the one the link names", async () => {
		const { answers } = serving("/corpus");
		const link = await screen.findByRole("link", { name: "review them" });
		answers.set(
			"/api/corpus",
			corpus({
				kind: "measured",
				previous: CURRENT,
				current: LATER,
				count: 1,
				rows: [`run:${RUN_B}`],
			}),
		);

		fireEvent.click(link);

		await screen.findByText(
			/The edit this address names is no longer the last edit/u,
		);
		expect(screen.queryByText(RUN_B)).toBeNull();
	});

	it("lists no rows from the corpus report read before arrival while it is read again", async () => {
		const { hold } = serving("/corpus");
		const link = await screen.findByRole("link", { name: "review them" });
		hold("/api/corpus");

		fireEvent.click(link);

		await screen.findByText("Reading the last edit…");
		expect(screen.queryByRole("table")).toBeNull();
	});

	it("keeps listing the rows while the corpus report is read again on returning to the window", async () => {
		const { hold, held } = serving(`/?invalidatedBy=${PREVIOUS}..${CURRENT}`);
		await durableRecords();
		hold("/api/corpus");

		focusManager.setFocused(false);
		focusManager.setFocused(true);

		await waitFor(() => {
			expect(held()).toBe(1);
		});
		expect(screen.getByText(RUN_A)).toBeInTheDocument();
	});

	it("names the corpus versions the edit went from and to", async () => {
		serving(`/?invalidatedBy=${PREVIOUS}..${CURRENT}`);

		await durableRecords();

		expect(
			screen.getByText(
				"2 recorded results invalidated by the edit from corpus@e73e56 to corpus@a41c7e",
			),
		).toBeInTheDocument();
	});

	it("returns to every record when another filter is chosen", async () => {
		serving(`/?invalidatedBy=${PREVIOUS}..${CURRENT}`);
		await durableRecords();

		fireEvent.click(screen.getByRole("button", { name: "All 3" }));

		await waitFor(() => {
			expect(screen.getByText(RUN_B)).toBeInTheDocument();
		});
		expect(screen.queryByText(/invalidated by the edit from/u)).toBeNull();
	});

	it("names an invalidated result that has no readable row, with the reason it could not be read", async () => {
		serving(`/?invalidatedBy=${PREVIOUS}..${CURRENT}`, {
			corpus: corpus({
				kind: "measured",
				previous: PREVIOUS,
				current: CURRENT,
				count: 3,
				rows: [`run:${RUN_A}`, "group:gone", "run:broken"],
			}),
			runs: history([
				{
					kind: "run",
					id: "run:broken",
					reason: "manifest.json does not parse",
				},
			]),
		});

		await durableRecords();

		expect(
			screen.getByText("group:gone: no row in run history"),
		).toBeInTheDocument();
		expect(
			screen.getByText("run:broken: manifest.json does not parse"),
		).toBeInTheDocument();
	});

	describe("when the address names an edit that is no longer the last edit", () => {
		it.each([
			["a later edit from the same version", PREVIOUS, LATER],
			["an edit from another version", LATER, CURRENT],
		])(
			"says so for %s and lists none of the last edit's results",
			async (_case, previous, current) => {
				serving(`/?invalidatedBy=${previous}..${current}`);

				await screen.findByText(
					/The edit this address names is no longer the last edit/u,
				);

				expect(screen.queryByRole("table")).toBeNull();
				expect(
					screen.getByRole("link", { name: "review the last edit's results" }),
				).toHaveAttribute("href", `/?invalidatedBy=${PREVIOUS}..${CURRENT}`);
			},
		);
	});

	describe("when the address cannot be answered", () => {
		const NAMED = `/?invalidatedBy=${PREVIOUS}..${CURRENT}`;

		type Case = readonly [
			string,
			string,
			Parameters<typeof serving>[1],
			string,
		];
		const cases: readonly Case[] = [
			...[
				"nonsense",
				"foo..bar",
				"e73e56..a41c7e",
				`${PREVIOUS}..${CURRENT}..${LATER}`,
				`..${CURRENT}`,
			].map((value): Case => [
				`the address names no edit (${value.slice(0, 20)})`,
				`/?invalidatedBy=${value}`,
				{},
				"The address names no edit, so no result is listed as invalidated by it.",
			]),
			[
				"the last edit is not recorded",
				NAMED,
				{
					corpus: corpus({
						kind: "not-recorded",
						reason: "the previous version e73e56 cannot be read from the store",
					}),
				},
				"The last edit is not recorded, so no result is listed as invalidated: the previous version e73e56 cannot be read from the store",
			],
			[
				"the corpus report failed",
				NAMED,
				{ failing: "/api/corpus" },
				"Could not load the corpus report, so no result is listed as invalidated.",
			],
			[
				"run history failed",
				NAMED,
				{ failing: "/api/runs" },
				"Could not load run history, so no result is listed as invalidated.",
			],
			[
				"the corpus report is loading",
				NAMED,
				{ pending: "/api/corpus" },
				"Reading the last edit…",
			],
			[
				"run history is loading",
				NAMED,
				{ pending: "/api/runs" },
				"Reading run history…",
			],
		];

		it.each(cases)(
			"lists no rows when %s and says why",
			async (_case, path, served, reason) => {
				serving(path, served);

				await screen.findByText(reason);

				expect(screen.queryByRole("table")).toBeNull();
			},
		);
	});
});
