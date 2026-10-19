import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import type { JudgeProgress } from "./run-events";
import { openRunEventStore } from "./run-events";
import RunEventBuilder from "./run-events-event-test-builder";
import { seedEventsBeforeJudgeProgress } from "./run-events-legacy-test-fixture";
import ReturningJudgeProgressBuilder from "./run-events-progress-test-builder";
import RunEventResources from "./run-events-test-resources";

const INITIAL_EVENT_CURSOR = 0;

const resources = RunEventResources.forEachTest();

const RETURNING: JudgeProgress = new ReturningJudgeProgressBuilder({}).build();

async function keepsAJudgeProgressEventSCountsAndServesThemBack(): Promise<void> {
	const store = resources.own(await openRunEventStore(":memory:"));

	store.append(
		new RunEventBuilder({
			elapsedMs: 10,
			judge: RETURNING,
			kind: "judge-progress",
			spentUsd: 1,
			stage: "build",
		}).build(),
	);

	expect(store.latestEvent("run-1")).toMatchObject({
		judge: RETURNING,
		kind: "judge-progress",
	});
	store.close();
}

async function opensAStoreCreatedBeforeJudgeProgressKeepsItsEventsAndRecordsNewOnes(): Promise<void> {
	const directory = await resources.directory();
	const path = join(directory, "events.sqlite");
	seedEventsBeforeJudgeProgress(path);

	const store = resources.own(await openRunEventStore(path));
	store.append(
		new RunEventBuilder({
			elapsedMs: 10,
			judge: { attempt: 1, reason: "unknown id", state: "rejected" },
			kind: "judge-progress",
			spentUsd: 1,
			stage: "build",
		}).build(),
	);

	expect(
		store
			.eventsSince("run-1", INITIAL_EVENT_CURSOR)
			.map(({ kind, judge }) => ({ judge, kind })),
	).toEqual([
		{ judge: undefined, kind: "stage-judging" },
		{
			judge: { attempt: 1, reason: "unknown id", state: "rejected" },
			kind: "judge-progress",
		},
	]);
	store.close();
}

describe(openRunEventStore.name, () => {
	describe("when recording judge progress", () => {
		it(
			"keeps a judge progress event's counts and serves them back",
			keepsAJudgeProgressEventSCountsAndServesThemBack,
		);
		it(
			"opens a store created before judge progress, keeps its events and records new ones",
			opensAStoreCreatedBeforeJudgeProgressKeepsItsEventsAndRecordsNewOnes,
		);
	});
});
