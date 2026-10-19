import type { RenderResult } from "@testing-library/react";

import type { FakeServer, Reply } from "#client/test-support/fetch-stub";
import LiveReply from "#client/test-support/live-reply";

import { renderHistory, serving } from "./run-history-page-replay-fixture";
import {
	FINISHED,
	ReplayHistoryBuilder,
} from "./run-history-page-replay-history-builder";

interface ReactiveReplayHistory {
	readonly dialog: HTMLElement;
	readonly page: RenderResult;
	readonly server: FakeServer;
	readonly omitFinishedRun: () => void;
	readonly refuseHistoryRead: () => void;
}

async function openReactiveReplayHistory(): Promise<ReactiveReplayHistory> {
	const history = new ReplayHistoryBuilder().build();
	let reply: Reply = { body: history, status: 200 };
	const server = serving(
		history,
		new Map([["GET /api/run-listing", new LiveReply(() => reply)]]),
	);
	const { page, openReplay } = renderHistory();
	const dialog = await openReplay();

	return {
		dialog,
		omitFinishedRun: () => {
			reply = {
				body: {
					...history,
					rows: history.rows.filter(
						(row) => row.kind === "run" && row.run !== FINISHED,
					),
				},
				status: 200,
			};
		},
		page,
		refuseHistoryRead: () => {
			reply = { body: {}, status: 500 };
		},
		server,
	};
}

export { openReactiveReplayHistory as default };
