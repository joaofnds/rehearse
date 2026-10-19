import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import { screen, waitFor, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import FakeEventSource from "#client/test-support/event-source";
import {
	SHELL_BASELINE,
	renderAppAt,
	stubFetchFailing,
} from "#client/test-support/render-app";

import {
	completed,
	completedRecord,
	newerRow,
} from "./monitor-record-navigation-fixtures";
import {
	RUN,
	header,
	monitorBodies,
	originalFetch,
	renderAppWithStub,
	renderMonitor,
	selectStage,
	serveMonitor,
	stubFetchByPath,
} from "./monitor-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
});

describe("/monitor across runs", () => {
	it("shows the newest run in flight", showsTheNewestRunInFlight);

	it(
		"shows the run in flight its address names, when another is newer",
		showsTheRunInFlightItsAddressNamesWhenAnotherIsNewer,
	);

	it(
		"keeps a named completed run visible while another is in flight",
		keepsANamedCompletedRunVisibleWhileAnotherIsInFlight,
	);

	it(
		"keeps the run and selected step when it ends while another runs",
		keepsTheRunAndSelectedStepWhenItEndsWhileAnotherRuns,
	);

	it(
		"keeps the newest run opened through the legacy monitor after it ends",
		keepsTheNewestRunOpenedThroughTheLegacyMonitorAfterItEnds,
	);

	it(
		"says so when the runs in flight cannot be read",
		saysSoWhenTheRunsInFlightCannotBeRead,
	);
});

async function keepsTheNewestRunOpenedThroughTheLegacyMonitorAfterItEnds(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN }).withExecutionProgress().build(),
	);
	await screen.findByRole("region", { name: "Task graph" });
	const stream = FakeEventSource.openOn(`/api/runs/${RUN}/events`);
	serveMonitor(
		new PipelineRunRowBuilder({ run: RUN, status: "COMPLETE" })
			.withExecutionProgress()
			.build(),
	);

	stream.deliver();

	await waitFor(() => {
		expect(stream.closed).toBe(true);
	});
	expect(screen.getByRole("button", { name: "Activity" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	expect(
		screen.getByRole("region", { name: "Live agent session" }),
	).toHaveTextContent("build");
}

async function saysSoWhenTheRunsInFlightCannotBeRead(): Promise<void> {
	stubFetchFailing("/api/run-listing");
	renderAppAt("/monitor");

	expect(
		await within(await screen.findByRole("main")).findByRole("alert"),
	).toHaveTextContent("Could not read the runs in flight.");
}

async function showsTheNewestRunInFlight(): Promise<void> {
	const fetchReplies = new Map<string, unknown>([
		...monitorBodies(
			new PipelineRunRowBuilder({ run: RUN }).withExecutionProgress().build(),
		),
		...monitorBodies(newerRow()),
		[
			"/api/run-listing",
			new NamedHistoryBuilder({
				rows: [
					new PipelineRunRowBuilder({ run: RUN })
						.withExecutionProgress()
						.build(),
					newerRow(),
				],
			}).build(),
		],
	]);
	renderAppWithStub("/monitor", fetchReplies);

	expect(await header()).toHaveTextContent("r-0149audit-log");
}

async function showsTheRunInFlightItsAddressNamesWhenAnotherIsNewer(): Promise<void> {
	const fetchReplies = new Map<string, unknown>([
		...monitorBodies(
			new PipelineRunRowBuilder({ run: RUN }).withExecutionProgress().build(),
		),
		...monitorBodies(newerRow()),
		[
			"/api/run-listing",
			new NamedHistoryBuilder({
				rows: [
					new PipelineRunRowBuilder({ run: RUN })
						.withExecutionProgress()
						.build(),
					newerRow(),
				],
			}).build(),
		],
	]);
	renderAppWithStub(`/monitor/${RUN}`, fetchReplies);

	expect(await header()).toHaveTextContent("r-0148audit-log");
}

async function keepsANamedCompletedRunVisibleWhileAnotherIsInFlight(): Promise<void> {
	const fetchResponses = new Map<string, unknown>([
		...monitorBodies(newerRow()),
		[
			"/api/run-listing",
			new NamedHistoryBuilder({ rows: [completed, newerRow()] }).build(),
		],
		[`/api/runs/${RUN}`, completedRecord],
	]);
	renderAppWithStub(`/monitor/${RUN}`, fetchResponses);

	expect(await header()).toHaveTextContent("r-0148audit-log");
	expect(await header()).toHaveTextContent("completed");
	expect(
		await screen.findByRole("region", { name: "Run workspace" }),
	).toBeInTheDocument();
}

async function keepsTheRunAndSelectedStepWhenItEndsWhileAnotherRuns(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ stage: "build" })
			.build(),
	);
	await selectStage("plan");
	const fetchResponses = new Map<string, unknown>([
		...SHELL_BASELINE,
		...monitorBodies(newerRow()),
		[
			"/api/run-listing",
			new NamedHistoryBuilder({ rows: [completed, newerRow()] }).build(),
		],
		[`/api/runs/${RUN}`, completedRecord],
	]);
	stubFetchByPath(fetchResponses);

	FakeEventSource.openOn(`/api/runs/${RUN}/events`).deliver();

	await waitFor(() => {
		expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
			"r-0148",
		);
		expect(
			screen.getByRole("heading", { level: 1 }).closest("header"),
		).toHaveTextContent("completed");
	});
	expect(
		within(await screen.findByRole("region", { name: "Task graph" })).getByRole(
			"button",
			{ current: "step" },
		),
	).toHaveTextContent("plan");
}
