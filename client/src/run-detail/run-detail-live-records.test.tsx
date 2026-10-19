import { afterEach, describe, expect, it } from "bun:test";

import { screen, waitFor, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import LiveReply from "#client/test-support/live-reply";
import { RUN, serveRunDetail } from "#client/test-support/run-detail";

import {
	MOVING_ATTEMPTS_RECORD,
	MOVING_CHECKPOINT_ATTEMPTS,
	MOVING_RUN_RECORDS,
	originalFetch,
} from "./run-detail-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("/runs/$run", () => {
	it(
		"reads the run record again when a live run moves to its next step",
		readsTheRunRecordAgainWhenALiveRunMovesToItsNextStep,
	);

	it(
		"reads the attempts at the selected step's checkpoint again when a live run moves on",
		readsTheAttemptsAtTheSelectedStepSCheckpointAgainWhenALiveRunMovesOn,
	);
});

async function readsTheRunRecordAgainWhenALiveRunMovesToItsNextStep(): Promise<void> {
	let running = "build";
	serveRunDetail(
		new Map([
			[
				"GET /api/runs",
				new LiveReply(() => ({
					body: new NamedHistoryBuilder({
						rows: [
							new PipelineRunRowBuilder({ run: RUN })
								.withExecutionProgress({ stage: running })
								.build(),
						],
					}).build(),
					status: 200,
				})),
			],
			[
				`GET /api/runs/${RUN}`,
				new LiveReply(() => ({
					body: MOVING_RUN_RECORDS.get(running),
					status: 200,
				})),
			],
		]),
	);

	const graph = await screen.findByRole("region", { name: "Task graph" });

	expect(
		within(graph).getByRole("button", { name: /^build/u }),
	).not.toHaveTextContent("Continued");
	running = "verify";

	await waitFor(
		() => {
			expect(
				within(graph).getByRole("button", { name: /^build/u }),
			).toHaveTextContent("Continued");
		},
		{ timeout: 5000 },
	);
	expect(
		screen.getByRole("region", { name: "Live agent session" }),
	).toHaveTextContent("Step 3 · verify");
}

async function readsTheAttemptsAtTheSelectedStepSCheckpointAgainWhenALiveRunMovesOn(): Promise<void> {
	const expectedListItemCount = 0;

	let running = "build";
	serveRunDetail(
		new Map([
			[
				"GET /api/runs",
				new LiveReply(() => ({
					body: new NamedHistoryBuilder({
						rows: [
							new PipelineRunRowBuilder({ run: RUN })
								.withExecutionProgress({ stage: running })
								.build(),
						],
					}).build(),
					status: 200,
				})),
			],
			[
				`GET /api/runs/${RUN}`,
				new LiveReply(() => ({ body: MOVING_ATTEMPTS_RECORD, status: 200 })),
			],
			[
				`GET /api/runs/${RUN}/stages/build/attempts`,
				new LiveReply(() => ({
					body: MOVING_CHECKPOINT_ATTEMPTS.get(running),
					status: 200,
				})),
			],
		]),
		undefined,
		`/runs/${RUN}?view=results&step=build`,
	);

	const list = await screen.findByRole("list", {
		name: "Attempts at c-0147-1",
	});
	expect(within(list).queryAllByRole("listitem")).toHaveLength(
		expectedListItemCount,
	);
	running = "verify";

	expect(
		await within(list).findByText("r-0147", {}, { timeout: 5000 }),
	).toBeInTheDocument();
}
