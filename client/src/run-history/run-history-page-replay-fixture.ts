import { expect } from "bun:test";

import type { RenderResult } from "@testing-library/react";
import { fireEvent, waitFor } from "@testing-library/react";

import { FakeServer } from "#client/test-support/fetch-stub";
import type { Reply } from "#client/test-support/fetch-stub";
import type LiveReply from "#client/test-support/live-reply";

import { ReplayHistoryBuilder } from "./run-history-page-replay-history-builder";
import { renderPage } from "./run-history-page-test-harness";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const LAUNCH_ID = "9c1d2e3f-0000-4000-8000-000000000000";

interface RenderedHistory {
	readonly page: RenderResult;
	readonly enabledReplayAction: () => Promise<HTMLElement>;
	readonly openReplay: () => Promise<HTMLElement>;
}

function serving(
	body: RunHistoryResponseBody = new ReplayHistoryBuilder().build(),
	replies: ReadonlyMap<string, Reply | LiveReply> = new Map(),
): FakeServer {
	const server = new FakeServer(
		new Map<string, Reply | LiveReply>([
			["GET /api/run-listing", { body, status: 200 }],
			[
				"GET /api/settings",
				{
					body: {
						linkedCorpus: { kind: "live", root: "/home/.claude" },
						overrun: "The ceiling can be overrun by the calls in flight.",
						recordsDirectory: "/records",
						setCommand: "rehearse settings --spend-ceiling-usd <USD>",
						spendCeilingUsd: 5,
					},
					status: 200,
				},
			],
			["POST /api/launches", { body: { id: LAUNCH_ID }, status: 202 }],
			...replies,
		]),
	);
	server.install();

	return server;
}

function renderHistory(): RenderedHistory {
	const page = renderPage();
	const enabledReplayAction = async (): Promise<HTMLElement> =>
		await waitFor(() => {
			const action = page.getByRole("button", { name: "Replay a step" });
			expect(action).toBeEnabled();

			return action;
		});

	return {
		enabledReplayAction,
		openReplay: async () => {
			fireEvent.click(await enabledReplayAction());

			return await page.findByRole("dialog");
		},
		page,
	};
}

export { serving, renderHistory, LAUNCH_ID };
