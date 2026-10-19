import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { openRunEventStore } from "./run-events";
import RunEventBuilder from "./run-events-event-test-builder";
import {
	seedEventsBeforeRunSpend,
	seedEventsBeforeSessionIds,
} from "./run-events-legacy-test-fixture";
import RunEventResources from "./run-events-test-resources";

const INITIAL_EVENT_CURSOR = 0;

const resources = RunEventResources.forEachTest();

async function opensAStoreCreatedBeforeRunSpendReadsItsEventsWithNoneAndRecordsItAndTheRunSTokensOnNewOnes(): Promise<void> {
	const directory = await resources.directory();
	const path = join(directory, "events.sqlite");
	seedEventsBeforeRunSpend(path);

	const store = resources.own(await openRunEventStore(path));
	store.append(
		new RunEventBuilder({
			elapsedMs: 10,
			kind: "turn-completed",
			runSpentUsd: 1.5,
			runTokens: { input: 120, output: 30 },
			spentUsd: 1,
			stage: "build",
		}).build(),
	);

	expect(
		store
			.eventsSince("run-1", INITIAL_EVENT_CURSOR)
			.map(({ kind, runSpentUsd, runTokens }) => ({
				kind,
				runSpentUsd,
				runTokens,
			})),
	).toEqual([
		{ kind: "stage-started", runSpentUsd: undefined, runTokens: undefined },
		{
			kind: "turn-completed",
			runSpentUsd: 1.5,
			runTokens: { input: 120, output: 30 },
		},
	]);
	store.close();
}

async function opensAStoreCreatedBeforeStageSessionIdsReadsItsEventsWithNoneAndRecordsOneOnANewStageStart(): Promise<void> {
	const directory = await resources.directory();
	const path = join(directory, "events.sqlite");
	seedEventsBeforeSessionIds(path);

	const store = resources.own(await openRunEventStore(path));
	store.append(
		new RunEventBuilder({
			elapsedMs: 10,
			sessionId: "0b7e8d0c-2f4c-4a54-9a3e-6f1d2c3b4a59",
			spentUsd: 1,
			stage: "build",
		}).build(),
	);

	expect(
		store
			.eventsSince("run-1", INITIAL_EVENT_CURSOR)
			.map(({ stage, sessionId }) => ({
				sessionId,
				stage,
			})),
	).toEqual([
		{ sessionId: undefined, stage: "shape" },
		{ sessionId: "0b7e8d0c-2f4c-4a54-9a3e-6f1d2c3b4a59", stage: "build" },
	]);
	store.close();
}

describe(openRunEventStore.name, () => {
	describe("when opening records written by an earlier version", () => {
		it(
			"opens a store created before run spend, reads its events with none and records it and the run's tokens on new ones",
			opensAStoreCreatedBeforeRunSpendReadsItsEventsWithNoneAndRecordsItAndTheRunSTokensOnNewOnes,
		);
		it(
			"opens a store created before stage session ids, reads its events with none and records one on a new stage start",
			opensAStoreCreatedBeforeStageSessionIdsReadsItsEventsWithNoneAndRecordsOneOnANewStageStart,
		);
	});
});
