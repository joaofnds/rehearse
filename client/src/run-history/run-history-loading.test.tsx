import { afterEach, describe, expect, it } from "bun:test";
import { focusManager } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderAppAt, SHELL_BASELINE } from "#client/test-support/render-app";
import { runRow } from "#client/test-support/runs-in-flight";
import {
	stubFetchByPath,
	runHistoryReplies,
	stalenessBody,
} from "#client/test-support/fetch-stub";
import type { RunHistoryResponse } from "./run-history-query";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
	focusManager.setFocused(undefined);
});

const RUN = "2026-10-01T00-00-00.000Z";
const row = {
	...runRow({ run: RUN, status: "COMPLETE" }),
	shortId: "run-1",
	staleness: {
		state: "available",
		stale: false,
		causes: [],
		changedFiles: [],
		onlyCorpusFiles: true,
		distance: { kind: "measured", versions: 0 },
	},
} as const;
const history: RunHistoryResponse = {
	rows: [row],
	launches: [],
	unreadable: [],
};

interface PendingFreshness {
	readonly finish: (status?: number) => void;
	readonly paths: readonly string[];
}

function waitingForFreshness(
	listed: RunHistoryResponse = history,
): PendingFreshness {
	const response = Promise.withResolvers<Response>();
	const paths: string[] = [];
	stubFetchByPath(new Map([...SHELL_BASELINE, ["/api/run-listing", listed]]));
	const answer = globalThis.fetch;
	const stub = Object.assign(
		(request: string | URL | Request): Promise<Response> => {
			const { pathname } = new URL(
				request instanceof Request ? request.url : request,
				"http://localhost",
			);
			paths.push(pathname);
			return pathname === "/api/run-staleness"
				? response.promise
				: answer(request);
		},
		{ preconnect: originalFetch.preconnect },
	);
	globalThis.fetch = stub;
	return {
		paths,
		finish: (status = 200) => {
			response.resolve(Response.json(stalenessBody(listed), { status }));
		},
	};
}

describe("initial run history", () => {
	it.each(["current", "stale"])(
		"reports an initial list failure with the %s corpus filter",
		async (filter) => {
			const replies = new Map(SHELL_BASELINE);
			replies.delete("/api/run-listing");
			stubFetchByPath(replies);

			renderAppAt(`/?corpus=${filter}`);

			await screen.findByText("Could not load run history.");
			expect(screen.queryByText("Loading…")).toBeNull();
		},
	);

	it("renders saved readings while freshness is pending without requesting the full reports", async () => {
		const pending = waitingForFreshness();
		renderAppAt("/");

		const table = await screen.findByRole("table", { name: "Run history" });
		expect(within(table).getByText(row.shortId)).toBeInTheDocument();
		expect(within(table).getByText("Checking freshness…")).toBeInTheDocument();
		expect(pending.paths).not.toContain("/api/runs");
		expect(pending.paths).not.toContain("/api/corpus");

		pending.finish();
		expect(await within(table).findByText("clean")).toBeInTheDocument();
	});

	it("waits for a judgment before answering the current-corpus filter", async () => {
		const pending = waitingForFreshness();
		renderAppAt("/");
		await screen.findByRole("table", { name: "Run history" });

		fireEvent.click(screen.getByRole("button", { name: "Current corpus" }));
		await waitFor(() => {
			expect(
				screen.queryByRole("table", { name: "Run history" }) === null,
			).toBe(true);
		});
		expect(
			screen.queryByText("No record matches this filter and search."),
		).toBeNull();
		pending.finish();

		const table = await screen.findByRole("table", { name: "Run history" });
		expect(within(table).getByText("clean")).toBeInTheDocument();
	});

	it("withdraws a cached clean judgment while refreshing and after a failure", async () => {
		stubFetchByPath(
			new Map([...SHELL_BASELINE, ...runHistoryReplies(history)]),
		);
		renderAppAt("/");
		const table = await screen.findByRole("table", { name: "Run history" });
		await within(table).findByText("clean");
		const pending = waitingForFreshness();

		focusManager.setFocused(false);
		focusManager.setFocused(true);

		await within(table).findByText("Checking freshness…");
		expect(within(table).queryByText("clean")).toBeNull();
		pending.finish(503);
		await within(table).findByText("Could not check run freshness");
		expect(within(table).getByText(row.shortId)).toBeInTheDocument();
		expect(within(table).queryByText("clean")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Current corpus" }));
		await screen.findByText("No record matches this filter and search.");
		expect(screen.queryByRole("table", { name: "Run history" })).toBeNull();
	});

	it("checks a replacement record again before treating it as current", async () => {
		stubFetchByPath(
			new Map([...SHELL_BASELINE, ...runHistoryReplies(history)]),
		);
		renderAppAt("/");
		await screen.findByText("clean");
		const replacement: RunHistoryResponse = {
			...history,
			rows: [
				{
					...row,
					caseId: "replacement-case",
					staleness: {
						...row.staleness,
						stale: true,
						distance: { kind: "measured", versions: 1 },
					},
				},
			],
		};
		const pending = waitingForFreshness(replacement);

		focusManager.setFocused(false);
		focusManager.setFocused(true);

		const table = await screen.findByRole("table", { name: "Run history" });
		await within(table).findByText("replacement-case");
		expect(within(table).getByText("Checking freshness…")).toBeInTheDocument();
		expect(within(table).queryByText("clean")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Current corpus" }));
		await waitFor(() => {
			expect(
				screen.queryByRole("table", { name: "Run history" }) === null,
			).toBe(true);
		});
		expect(
			screen.queryByText("No record matches this filter and search."),
		).toBeNull();
		pending.finish();
		await screen.findByText("No record matches this filter and search.");
		expect(screen.queryByRole("table", { name: "Run history" })).toBeNull();
	});

	it("keeps saved readings visible when checking freshness fails", async () => {
		const pending = waitingForFreshness();
		renderAppAt("/");
		const table = await screen.findByRole("table", { name: "Run history" });

		pending.finish(503);

		await waitFor(() => {
			expect(
				within(table).getByText("Could not check run freshness"),
			).toBeInTheDocument();
		});
		expect(within(table).getByText(row.shortId)).toBeInTheDocument();
	});
});
