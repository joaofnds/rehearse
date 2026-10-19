import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	setSystemTime,
} from "bun:test";

import { fireEvent, screen, waitFor } from "@testing-library/react";

import { unversionedStaleness } from "#client/test-support/run-figures";
import type { PipelineRunRow } from "#server/run-history";

import RunHistoryPage from "./run-history-page";
import LaunchRowBuilder from "./run-history-page-launch-row-builder";
import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	serveRunHistory,
} from "./run-history-page-test-harness";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const RUNNING_RUN = "2026-09-07T00-00-00.000Z";

const LAUNCH_ID = "7b0c2d4e-0000-4000-8000-000000000000";

const RUN = "2026-09-07T00-00-00.000Z";

const FIRST_POSTED_REQUEST_INDEX = 0;

const NOW = new Date("2026-09-07T00:10:00.000Z");

const CONTROL_JSON_REQUESTS = [
	["Stop & restore repo", `/api/launches/${LAUNCH_ID}/stop`],
	["Pause after this step", `/api/runs/${RUN}/pause`],
] as const;

function runningRow(): Extract<
	RunHistoryResponseBody["rows"][number],
	{ readonly kind: "run" }
> {
	return new PipelineRunRowBuilder({
		progress: liveProgress(),
		recordId: "run:2026-09-07T00-00-00.000Z",
		run: RUNNING_RUN,
		stageGrades: {
			grades: ["shape", "build", "review"].map((stage) => ({
				grade: { reasons: ["not graded yet"], state: "unavailable" },
				stage,
				status: "no-record",
			})),
			state: "available",
		},
		staleness: unversionedStaleness({ causes: [], stale: false }),
		status: "RUNNING",
	}).build();
}

function liveProgress(): Extract<
	PipelineRunRow["progress"],
	{ readonly state: "running" }
> {
	return {
		ceilingUsd: undefined,
		elapsedMs: 9000,
		measuredAt: NOW.toISOString(),
		runSpentUsd: 1.2,
		runTokens: undefined,
		spendScope: "this stage's session so far",
		spentUsd: 0.9,
		stage: "build",
		stageElapsedMs: undefined,
		stageState: "session running",
		state: "running",
	};
}

async function testStopsARunTheBrowserLaunchedThroughItsLaunch(): Promise<void> {
	const server = serveRunHistory({
		launches: [],
		rows: [{ ...runningRow(), launchId: LAUNCH_ID }],
		unreadable: [],
	});
	renderPage();

	fireEvent.click(
		await screen.findByRole("button", { name: "Stop & restore repo" }),
	);

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted(`/api/launches/${LAUNCH_ID}/stop`)).toHaveLength(
			expectedPostedCount,
		);
	});
}

async function testAsksTheRunToPauseAfterTheStepItIsRunning(): Promise<void> {
	const server = serveRunHistory({
		launches: [],
		rows: [runningRow()],
		unreadable: [],
	});
	renderPage();

	fireEvent.click(
		await screen.findByRole("button", { name: "Pause after this step" }),
	);

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted(`/api/runs/${RUN}/pause`)).toHaveLength(
			expectedPostedCount,
		);
	});
}

async function testStopsALaunchThatHasNoRecordYet(): Promise<void> {
	const server = serveRunHistory({
		launches: [
			new LaunchRowBuilder({
				attempts: 3,
				id: LAUNCH_ID,
				launchedAt: new Date().toISOString(),
			}).build(),
		],
		rows: [],
		unreadable: [],
	});
	renderPage();

	fireEvent.click(
		await screen.findByRole("button", { name: "Stop & restore repo" }),
	);

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted(`/api/launches/${LAUNCH_ID}/stop`)).toHaveLength(
			expectedPostedCount,
		);
	});
}

async function testShowsTheServerSRefusal(): Promise<void> {
	serveRunHistory(
		{ launches: [], rows: [runningRow()], unreadable: [] },
		new Map([
			[
				`POST /api/runs/${RUN}/pause`,
				{ body: { error: `Run ${RUN} is not running` }, status: 409 },
			],
		]),
	);
	renderPage();

	fireEvent.click(
		await screen.findByRole("button", { name: "Pause after this step" }),
	);

	expect(await screen.findByRole("alert")).toHaveTextContent(
		`Run ${RUN} is not running`,
	);
}

async function testMarksTheServerSRefusalWithTheWarningGlyph(): Promise<void> {
	serveRunHistory(
		{ launches: [], rows: [runningRow()], unreadable: [] },
		new Map([
			[
				`POST /api/runs/${RUN}/pause`,
				{ body: { error: `Run ${RUN} is not running` }, status: 409 },
			],
		]),
	);
	renderPage();

	fireEvent.click(
		await screen.findByRole("button", { name: "Pause after this step" }),
	);

	const refusal = await screen.findByRole("alert");

	expect(refusal).toHaveTextContent(/^⚠/u);
	expect(refusal).toHaveClass("text-12");
}

async function testStopsItThroughTheRunWhoseTargetClaimNamesItsProcess(): Promise<void> {
	const server = serveRunHistory({
		launches: [],
		rows: [runningRow()],
		unreadable: [],
	});
	renderPage();

	fireEvent.click(
		await screen.findByRole("button", { name: "Stop & restore repo" }),
	);

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted(`/api/runs/${RUN}/stop`)).toHaveLength(
			expectedPostedCount,
		);
	});
}

async function testSendsControlAsJson(
	name: string,
	path: string,
): Promise<void> {
	const server = serveRunHistory({
		launches: [],
		rows: [{ ...runningRow(), launchId: LAUNCH_ID }],
		unreadable: [],
	});
	renderPage();

	fireEvent.click(await screen.findByRole("button", { name }));

	await waitFor(() => {
		expect(server.posted(path)[FIRST_POSTED_REQUEST_INDEX]?.contentType).toBe(
			"application/json",
		);
	});
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("when a run is in flight", () => {
		beforeEach(() => {
			setSystemTime(NOW);
		});
		afterEach(() => {
			setSystemTime();
		});
		describe("when the operator ends it", () => {
			it(
				"stops a run the browser launched through its launch",
				testStopsARunTheBrowserLaunchedThroughItsLaunch,
			);
			it.each(CONTROL_JSON_REQUESTS)(
				"sends %s as JSON so the request guard admits it",
				testSendsControlAsJson,
			);
			it(
				"asks the run to pause after the step it is running",
				testAsksTheRunToPauseAfterTheStepItIsRunning,
			);
			it(
				"stops a launch that has no record yet",
				testStopsALaunchThatHasNoRecordYet,
			);
			it("shows the server's refusal", testShowsTheServerSRefusal);
			it(
				"marks the server's refusal with the warning glyph",
				testMarksTheServerSRefusalWithTheWarningGlyph,
			);
			describe("when the browser did not launch it", () => {
				it(
					"stops it through the run, whose target claim names its process",
					testStopsItThroughTheRunWhoseTargetClaimNamesItsProcess,
				);
			});
		});
	});
});
