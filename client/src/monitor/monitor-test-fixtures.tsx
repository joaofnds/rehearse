import { expect } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { stubFetchByPath as stubFetchByPathBase } from "#client/test-support/fetch-stub";
import {
	SHELL_BASELINE,
	renderAppWithStub as renderAppWithStubBase,
} from "#client/test-support/render-app";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";

async function paneTitles(): Promise<readonly string[]> {
	const session = await screen.findByRole("region", {
		name: "Live agent session",
	});
	const judge = screen.getByRole("region", { name: "Judge" });

	return [session, judge].map(
		(pane) => within(pane).getByRole("heading", { level: 2 }).textContent,
	);
}

type HistoryRow = RunHistoryResponse["rows"][number];

const RUN = "2026-09-30T10-00-00.000Z";

const originalFetch = globalThis.fetch;

/** The monitor and the workspace read different projections of the same run list. */
function bothRunListings(
	bodies: ReadonlyMap<string, unknown>,
): ReadonlyMap<string, unknown> {
	const listing = bodies.get("/api/run-listing") ?? bodies.get("/api/runs");
	if (listing === undefined) {
		return bodies;
	}
	return new Map([
		...bodies,
		["/api/run-listing", listing],
		["/api/runs", listing],
	]);
}

function renderAppWithStub(
	path: string,
	bodies: ReadonlyMap<string, unknown>,
): void {
	renderAppWithStubBase(path, bothRunListings(bodies));
}

function stubFetchByPath(bodies: ReadonlyMap<string, unknown>): void {
	stubFetchByPathBase(bothRunListings(bodies));
}

type PipelineRow = Extract<HistoryRow, { readonly kind: "run" }>;

/** What the server answers for one run in flight at build: its row and its record. */
function monitorBodies(row: PipelineRow): ReadonlyMap<string, unknown> {
	return new Map<string, unknown>([
		["/api/run-listing", new NamedHistoryBuilder({ rows: [row] }).build()],
		["/api/runs", new NamedHistoryBuilder({ rows: [row] }).build()],
		[
			`/api/runs/${row.run}`,
			new RunRecordBuilder({
				run: row.run,
				stages: [
					new RunRecordStageBuilder({
						stage: "plan",
						status: "graded",
					}).build(),
					new RunRecordStageBuilder().build(),
				],
			}).build(),
		],
	]);
}

/** The monitor on one run in flight at build, its record served beside it. */
function renderMonitor(
	row: PipelineRow,
	extra: ReadonlyMap<string, unknown> = new Map(),
): void {
	renderAppWithStub(
		"/monitor",
		new Map<string, unknown>([...monitorBodies(row), ...extra]),
	);
}

/** The server answering from now on with the run's later readings. */
function serveMonitor(row: PipelineRow): void {
	stubFetchByPath(
		new Map<string, unknown>([...SHELL_BASELINE, ...monitorBodies(row)]),
	);
}

/** The task graph's node for a stage. */
async function graphNode(stage: string): Promise<HTMLElement> {
	const graph = await screen.findByRole("region", { name: "Task graph" });
	const shown = within(graph)
		.getAllByRole("listitem")
		.find((item) => within(item).queryByText(stage) !== null);
	if (shown === undefined) {
		throw new Error(`the graph draws no node for ${stage}`);
	}

	return shown;
}

async function selectStage(stage: string): Promise<void> {
	fireEvent.click(within(await graphNode(stage)).getByRole("button"));
	await waitFor(() => {
		expect(
			within(screen.getByRole("region", { name: "Task graph" })).getByRole(
				"button",
				{ current: "step" },
			),
		).toHaveTextContent(stage);
	});
}

/** The header the run's title heads, apart from the bar that repeats its readings. */
async function header(): Promise<HTMLElement> {
	const title = await screen.findByRole("heading", { level: 1 });
	const shown = title.closest("header");
	if (shown === null) {
		throw new Error("the run's title heads no header");
	}

	return shown;
}

export {
	RUN,
	graphNode,
	header,
	monitorBodies,
	originalFetch,
	paneTitles,
	renderAppWithStub,
	renderMonitor,
	selectStage,
	serveMonitor,
	stubFetchByPath,
};

export type { PipelineRow };
