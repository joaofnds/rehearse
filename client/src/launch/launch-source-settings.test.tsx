import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { fireEvent, waitFor, within } from "@testing-library/react";

import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";

import { LaunchDialog } from "./launch-dialog";
import {
	FIRST_POSTED_REQUEST_INDEX,
	openDialog,
	originalFetch,
	serving,
	startButton,
} from "./launch-test-fixtures";

let pendingSource: PromiseWithResolvers<Response> | null = null;

let sourceConditions: HTMLElement | null = null;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(LaunchDialog.name, () => {
	describe("while the replay source record is pending", () => {
		beforeEach(opensPendingSource);
		it(
			"keeps source settings pending while a replay's source record loads",
			keepsSourceSettingsPendingWhileAReplaySSourceRecordLoads,
		);
	});

	it(
		"distinguishes frozen replay input and recorded source settings from upcoming settings",
		distinguishesFrozenReplayInputAndRecordedSourceSettingsFromUpcomingSettings,
	);

	it(
		"states the corpus version the launch will run against",
		statesTheCorpusVersionTheLaunchWillRunAgainst,
	);

	it(
		"posts the run and stage when replaying a stage",
		postsTheRunAndStageWhenReplayingAStage,
	);

	describe("when opened on a stage replay with its attempts chosen", () => {
		it("posts that many attempts", postsThatManyAttempts);
	});
});

async function opensPendingSource(): Promise<void> {
	serving();
	const answer = globalThis.fetch;
	const pending = Promise.withResolvers<Response>();
	pendingSource = pending;
	const stub = async (request: string | URL | Request): Promise<Response> => {
		const { pathname } = new URL(
			request instanceof Request ? request.url : request,
			"http://localhost",
		);
		return await (pathname === "/api/runs/source-run"
			? pending.promise
			: answer(request));
	};
	stub.preconnect = fetch.preconnect;
	globalThis.fetch = stub;
	const dialog = await openDialog({
		kind: "replay",
		run: "source-run",
		stage: "build",
	});
	sourceConditions = await within(dialog).findByRole("region", {
		name: "Launch conditions",
	});
}

async function keepsSourceSettingsPendingWhileAReplaySSourceRecordLoads(): Promise<void> {
	if (pendingSource === null || sourceConditions === null) {
		throw new Error("source setup did not run");
	}
	expect(sourceConditions).toHaveTextContent("Reading source record…");
	expect(sourceConditions).not.toHaveTextContent("not recorded");
	expect(sourceConditions).not.toHaveTextContent("unavailable");
	const sourceRecord = new RunRecordBuilder({
		run: "source-run",
		stages: [new RunRecordStageBuilder().build()],
	}).build();
	pendingSource.resolve(Response.json(sourceRecord));
	expect(
		await within(sourceConditions).findByText("claude-opus-4"),
	).toBeInTheDocument();
}

async function distinguishesFrozenReplayInputAndRecordedSourceSettingsFromUpcomingSettings(): Promise<void> {
	const source = new RunRecordBuilder({
		run: "source-run",
		stages: [
			new RunRecordStageBuilder({
				artifactsIn: {
					entries: [
						{
							checkpointShortId: {
								shortId: "audit-log/r1/s1",
								state: "available",
							},
							from: "upstream checkpoint",
							target: "acme-api",
							upstream: "shape",
						},
					],
					missing: [],
				},

				stage: "build",
			}).build(),
		],
	}).build();
	serving(
		new Map([["GET /api/runs/source-run", { body: source, status: 200 }]]),
	);
	const dialog = await openDialog({
		kind: "replay",
		run: "source-run",
		stage: "build",
	});
	const conditions = await within(dialog).findByRole("region", {
		name: "Launch conditions",
	});

	expect(
		await within(conditions).findByText("claude-opus-4"),
	).toBeInTheDocument();
	expect(conditions).toHaveTextContent("audit-log/r1/s1");
	expect(conditions).toHaveTextContent("Recorded source effort: high");
	expect(conditions).toHaveTextContent(
		"Replay effort and Judge settings are resolved at launch; they are not guaranteed to match the source.",
	);
	expect(dialog).toHaveTextContent("current corpus");
}

async function statesTheCorpusVersionTheLaunchWillRunAgainst(): Promise<void> {
	serving();

	const dialog = await openDialog({ kind: "case" });

	expect(await within(dialog).findByText("corpus@a41c7e")).toBeInTheDocument();
}

async function postsTheRunAndStageWhenReplayingAStage(): Promise<void> {
	const server = serving();
	await openDialog({
		kind: "replay",
		run: "2026-09-06T21-58-29.508Z",
		stage: "build",
	});

	fireEvent.click(await startButton());

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted("/api/launches")).toHaveLength(expectedPostedCount);
	});
	expect(
		JSON.parse(
			server.posted("/api/launches")[FIRST_POSTED_REQUEST_INDEX]?.body ?? "",
		),
	).toEqual({
		attempts: 1,
		kind: "replay",
		run: "2026-09-06T21-58-29.508Z",
		stage: "build",
	});
}

async function postsThatManyAttempts(): Promise<void> {
	const server = serving();
	await openDialog({
		attempts: 3,
		kind: "replay",
		run: "2026-09-06T21-58-29.508Z",
		stage: "build",
	});

	fireEvent.click(await startButton());

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted("/api/launches")).toHaveLength(expectedPostedCount);
	});
	expect(
		JSON.parse(
			server.posted("/api/launches")[FIRST_POSTED_REQUEST_INDEX]?.body ?? "",
		),
	).toMatchObject({ attempts: 3, kind: "replay" });
}
