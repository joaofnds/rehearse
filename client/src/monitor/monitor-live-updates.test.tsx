import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import { screen, waitFor, within } from "@testing-library/react";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import FakeEventSource from "#client/test-support/event-source";
import { SHELL_BASELINE } from "#client/test-support/render-app";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";
import type { StageJudge } from "#server/stage-judge";

import {
	RUN,
	monitorBodies,
	originalFetch,
	renderMonitor,
	serveMonitor,
	stubFetchByPath,
} from "./monitor-test-fixtures";

const REPLAYED_EVENTS = 3;
const REPLAY_INCREMENT = 1;

afterEach(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
});

describe("/monitor live updates", () => {
	it(
		"moves the spend band when a run event arrives, without a reload",
		movesTheSpendBandWhenARunEventArrivesWithoutAReload,
	);

	it(
		"moves the task graph when a run event arrives, without a reload",
		movesTheTaskGraphWhenARunEventArrivesWithoutAReload,
	);

	it(
		"moves the judge pane when a run event arrives, without a reload",
		movesTheJudgePaneWhenARunEventArrivesWithoutAReload,
	);

	it(
		"reads the run once for events replayed while a read is in flight",
		readsTheRunOnceForEventsReplayedWhileAReadIsInFlight,
	);

	it(
		"closes the run's event stream once the run is no longer in flight",
		closesTheRunSEventStreamOnceTheRunIsNoLongerInFlight,
	);
});

async function movesTheSpendBandWhenARunEventArrivesWithoutAReload(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ ceilingUsd: 20, runSpentUsd: 1.83 })
			.build(),
	);
	const band = await screen.findByRole("region", { name: "Spend" });
	serveMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ ceilingUsd: 20, runSpentUsd: 2.4 })
			.build(),
	);

	FakeEventSource.openOn(`/api/runs/${RUN}/events`).deliver();

	expect(await within(band).findByText("$2.40")).toBeInTheDocument();
}

async function movesTheTaskGraphWhenARunEventArrivesWithoutAReload(): Promise<void> {
	const row = new PipelineRunRowBuilder({ run: RUN })
		.withExecutionProgress()
		.build();
	renderMonitor(row);
	const graph = await screen.findByRole("region", { name: "Task graph" });
	const fetchReplies = new Map<string, unknown>([
		...SHELL_BASELINE,
		...monitorBodies(row),
		[
			`/api/runs/${RUN}`,
			new RunRecordBuilder({
				run: RUN,
				stages: [
					new RunRecordStageBuilder({
						checkpoint: "recorded",

						checkpointShortId: { shortId: "ckpt-s1", state: "available" },

						stage: "plan",

						status: "graded",
					}).build(),
					new RunRecordStageBuilder().build(),
				],
			}).build(),
		],
	]);
	stubFetchByPath(fetchReplies);

	FakeEventSource.openOn(`/api/runs/${RUN}/events`).deliver();

	expect(await within(graph).findByText("ckpt-s1")).toBeInTheDocument();
}

async function movesTheJudgePaneWhenARunEventArrivesWithoutAReload(): Promise<void> {
	const row = new PipelineRunRowBuilder({ run: RUN })
		.withExecutionProgress({ stage: "build" })
		.build();
	const judgeAt = `/api/runs/${RUN}/stages/build/judge`;
	renderMonitor(row, new Map([[judgeAt, { state: "waiting" }]]));
	const pane = await screen.findByRole("region", { name: "Judge" });
	await within(pane).findByText("This step's judge has not started yet.");
	const started: StageJudge = { state: "returning" };
	stubFetchByPath(
		new Map<string, unknown>([
			...SHELL_BASELINE,
			...monitorBodies(row),
			[judgeAt, started],
		]),
	);

	FakeEventSource.openOn(`/api/runs/${RUN}/events`).deliver();

	expect(await within(pane).findByText("grading")).toBeInTheDocument();
}

async function readsTheRunOnceForEventsReplayedWhileAReadIsInFlight(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN }).withExecutionProgress().build(),
	);
	await screen.findByRole("region", { name: "Task graph" });
	const trace = recordFetchReads();
	globalThis.fetch = trace.fetch;
	const stream = FakeEventSource.openOn(`/api/runs/${RUN}/events`);

	for (let replay = 0; replay < REPLAYED_EVENTS; replay += REPLAY_INCREMENT) {
		stream.deliver();
	}

	await waitFor(() => {
		expect(
			trace.reads.filter((url) => url.endsWith(`/api/runs/${RUN}`)),
		).toEqual([`/api/runs/${RUN}`]);
	});
}

async function closesTheRunSEventStreamOnceTheRunIsNoLongerInFlight(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN }).withExecutionProgress().build(),
	);
	await screen.findByRole("region", { name: "Spend" });
	const opened = FakeEventSource.openOn(`/api/runs/${RUN}/events`);
	serveMonitor({
		...new PipelineRunRowBuilder({ run: RUN }).withExecutionProgress().build(),
		progress: { state: "recorded" },
	});

	opened.deliver();

	await waitFor(() => {
		expect(opened.closed).toBe(true);
	});
}

interface FetchReadTrace {
	readonly fetch: typeof fetch;
	readonly reads: readonly string[];
}
function recordFetchReads(): FetchReadTrace {
	const answer = globalThis.fetch;
	const reads: string[] = [];
	const counting = async (
		request: string | URL | Request,
	): Promise<Response> => {
		reads.push(request instanceof Request ? request.url : request.toString());
		return await answer(request);
	};
	counting.preconnect = answer.preconnect;
	return { fetch: counting, reads };
}
