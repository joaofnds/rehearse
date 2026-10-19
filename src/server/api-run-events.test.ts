import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { z } from "zod";

import type { JudgeProgress, NewRunEvent } from "#benchmark/run-events";
import { directorySource } from "#benchmark/run-records-test-support";
import ApiEventFixture from "#server/api-event-test-fixture";
import ApiEventReader from "#server/api-test-event-reader";
import { ApiTestWorkspace, apiTestApp } from "#server/api-test-workspace";

const NO_RECORDED_EVENTS = 0;

const FIRST_FRAME_INDEX = 0;

const SECOND_FRAME_INDEX = 1;

const EMPTY_COLLECTION_LENGTH = 0;

const workspace = new ApiTestWorkspace();

afterEach(async () => {
	await workspace.dispose();
});

const runEventSchema = z.object({ kind: z.string() }).loose();

function parseSSEFrames(
	body: string,
): readonly z.infer<typeof runEventSchema>[] {
	return body
		.split("\n\n")
		.filter(
			(frame) =>
				frame.length > EMPTY_COLLECTION_LENGTH && !frame.startsWith(":"),
		)
		.map((frame) =>
			runEventSchema.parse(
				JSON.parse(
					frame
						.split("\n")
						.filter((line) => line.startsWith("data:"))
						.map((line) => line.slice("data:".length).trim())
						.join("\n"),
				),
			),
		);
}

async function eventApp(
	events: readonly NewRunEvent[],
): Promise<ApiEventFixture> {
	const runsDirectory = await workspace.emptyDirectory("rehearse-api-runs-");
	const app = apiTestApp(
		runsDirectory,
		directorySource(await workspace.corpusDirectory()),
	);
	const fixture = new ApiEventFixture({ app, runsDirectory });
	if (events.length > NO_RECORDED_EVENTS) {
		await fixture.append(events);
	}

	return fixture;
}

describe("GET /api/runs/:run/events", () => {
	it(
		"streams every already-appended event as SSE frames, for a reader attaching mid-run",
		verifyStreamsEveryAlreadyAppendedEventAsSSEFramesFor,
	);

	it(
		"serves a stage judge's progress event with its per-section counts",
		verifyServesAStageJudgeSProgressEventWithIts,
	);

	it(
		"keeps a run with no events open rather than closing the connection, since the run may not have started emitting yet",
		verifyKeepsARunWithNoEventsOpenRatherThan,
	);

	it(
		"writes a comment line once a started stage goes quiet, so a server's idle timeout does not close a stream whose stage runs for minutes",
		verifyWritesACommentLineOnceAStartedStageGoes,
	);
});

async function verifyStreamsEveryAlreadyAppendedEventAsSSEFramesFor(): Promise<void> {
	const { app } = await eventApp([
		{
			elapsedMs: 0,
			kind: "stage-started",
			runId: "run-1",
			spentUsd: 0,
			stage: "shape",
		},
		{
			elapsedMs: 1000,
			kind: "run-completed",
			runId: "run-1",
			spentUsd: 1,
			stage: "shape",
		},
	]);

	const response = await app.events("run-1");
	const frames = parseSSEFrames(await response.text());

	expect(response.headers.get("content-type")).toBe("text/event-stream");
	expect(frames.map(({ kind }) => kind)).toEqual([
		"stage-started",
		"run-completed",
	]);
}

async function verifyServesAStageJudgeSProgressEventWithIts(): Promise<void> {
	const judge: JudgeProgress = {
		attempt: 1,
		sections: {
			dimensions: { returned: 3, total: 5 },
			hardBlockers: { returned: 4, total: 4 },
			requirements: { returned: 1, total: 2 },
		},
		state: "returning",
	};
	const { app } = await eventApp([
		{
			elapsedMs: 500,
			judge,
			kind: "judge-progress",
			runId: "run-1",
			spentUsd: 1,
			stage: "build",
		},
		{
			elapsedMs: 1000,
			kind: "run-completed",
			runId: "run-1",
			spentUsd: 2,
			stage: "build",
		},
	]);

	const response = await app.events("run-1");
	const frames = parseSSEFrames(await response.text());

	expect(frames[FIRST_FRAME_INDEX]).toMatchObject({
		judge,
		kind: "judge-progress",
		stage: "build",
	});
	expect(frames[SECOND_FRAME_INDEX]).not.toHaveProperty("judge");
}

async function verifyKeepsARunWithNoEventsOpenRatherThan(): Promise<void> {
	const fixture = await eventApp([]);
	await using reader = await ApiEventReader.open(fixture.app, "no-such-run");

	expect(reader.response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(reader.response.contentType).toBe("text/event-stream");
	expect(await reader.nextWrite()).toMatch(/^:[^\n]*\n\n$/u);
	await fixture.append([
		{
			elapsedMs: 0,
			kind: "stage-started",
			runId: "no-such-run",
			spentUsd: 0,
			stage: "build",
		},
	]);
	expect(parseSSEFrames(await reader.nextWrite())).toMatchObject([
		{
			kind: "stage-started",
			runId: "no-such-run",
			stage: "build",
		},
	]);
}

async function verifyWritesACommentLineOnceAStartedStageGoes(): Promise<void> {
	const { app } = await eventApp([
		{
			elapsedMs: 0,
			kind: "stage-started",
			runId: "quiet-run",
			spentUsd: 0,
			stage: "build",
		},
	]);
	await using reader = await ApiEventReader.open(app, "quiet-run");

	await reader.nextWrite();
	const writeAfterEvent = await reader.nextWrite();

	expect(writeAfterEvent).toMatch(/^:[^\n]*\n\n$/u);
}
