import { describe, expect, it } from "bun:test";

import { openRunEventStore } from "./run-events";
import RunEventBuilder from "./run-events-event-test-builder";
import RunEventResources from "./run-events-test-resources";

const INITIAL_EVENT_CURSOR = 0;

const NO_PRIOR_EVENT_SEQUENCE = 0;

const resources = RunEventResources.forEachTest();

async function replaysEveryAppendedEventForARunInAppendOrder(): Promise<void> {
	const store = resources.own(await openRunEventStore(":memory:"));

	store.append(new RunEventBuilder({}).build());
	store.append(
		new RunEventBuilder({
			elapsedMs: 1000,
			kind: "turn-completed",
			spentUsd: 0.5,
		}).build(),
	);

	expect(
		store
			.eventsSince("run-1", INITIAL_EVENT_CURSOR)
			.map(({ kind, spentUsd }) => ({
				kind,
				spentUsd,
			})),
	).toEqual([
		{ kind: "stage-started", spentUsd: 0 },
		{ kind: "turn-completed", spentUsd: 0.5 },
	]);
	store.close();
}

async function readsTheFirstEventOfTheRunAskedFor(): Promise<void> {
	const store = resources.own(await openRunEventStore(":memory:"));
	store.append(
		new RunEventBuilder({ runId: "run-2", stage: "discuss" }).build(),
	);
	const first = store.append(new RunEventBuilder({}).build());
	store.append(
		new RunEventBuilder({
			elapsedMs: 100,
			kind: "turn-completed",
			spentUsd: 0.5,
		}).build(),
	);

	expect(store.firstEvent("run-1")).toEqual(first);
	store.close();
}

async function keepsEventsForDifferentRunsSeparate(): Promise<void> {
	const expectedEventsSinceCount = 1;

	const store = resources.own(await openRunEventStore(":memory:"));

	store.append(new RunEventBuilder({}).build());
	store.append(
		new RunEventBuilder({ runId: "run-2", stage: "discuss" }).build(),
	);

	expect(store.eventsSince("run-1", INITIAL_EVENT_CURSOR)).toHaveLength(
		expectedEventsSinceCount,
	);
	expect(store.eventsSince("run-2", INITIAL_EVENT_CURSOR)).toHaveLength(
		expectedEventsSinceCount,
	);
	store.close();
}

async function returnsOnlyEventsAfterTheRequestedSequenceForAReaderThatReconnectsMidStream(): Promise<void> {
	const store = resources.own(await openRunEventStore(":memory:"));

	store.append(new RunEventBuilder({}).build());
	const [first] = store.eventsSince("run-1", INITIAL_EVENT_CURSOR);
	store.append(
		new RunEventBuilder({
			elapsedMs: 1000,
			kind: "turn-completed",
			spentUsd: 0.5,
		}).build(),
	);

	expect(
		store
			.eventsSince("run-1", first?.sequence ?? NO_PRIOR_EVENT_SEQUENCE)
			.map(({ kind }) => kind),
	).toEqual(["turn-completed"]);
	store.close();
}

async function reportsTheLatestEventRecordedForARun(): Promise<void> {
	const store = resources.own(await openRunEventStore(":memory:"));

	store.append(new RunEventBuilder({}).build());
	store.append(
		new RunEventBuilder({
			elapsedMs: 2000,
			kind: "run-completed",
			spentUsd: 1,
		}).build(),
	);

	expect(store.latestEvent("run-1")?.kind).toBe("run-completed");
	store.close();
}

async function reportsNoLatestEventForARunNothingWasAppendedTo(): Promise<void> {
	const store = resources.own(await openRunEventStore(":memory:"));

	expect(store.latestEvent("run-1")).toBeUndefined();
	store.close();
}

async function listsTheRunIdOfEveryRunHoldingAtLeastOneEvent(): Promise<void> {
	const store = resources.own(await openRunEventStore(":memory:"));
	store.append(new RunEventBuilder({}).build());
	store.append(
		new RunEventBuilder({ runId: "run-2", stage: "discuss" }).build(),
	);

	expect(store.runIds().toSorted()).toEqual(["run-1", "run-2"]);
	store.close();
}

describe(openRunEventStore.name, () => {
	describe("when reading appended run events", () => {
		it(
			"replays every appended event for a run in append order",
			replaysEveryAppendedEventForARunInAppendOrder,
		);
		it(
			"reads the first event of the run asked for",
			readsTheFirstEventOfTheRunAskedFor,
		);
		it(
			"keeps events for different runs separate",
			keepsEventsForDifferentRunsSeparate,
		);
		it(
			"returns only events after the requested sequence, for a reader that reconnects mid-stream",
			returnsOnlyEventsAfterTheRequestedSequenceForAReaderThatReconnectsMidStream,
		);
		it(
			"reports the latest event recorded for a run",
			reportsTheLatestEventRecordedForARun,
		);
		it(
			"reports no latest event for a run nothing was appended to",
			reportsNoLatestEventForARunNothingWasAppendedTo,
		);
		it(
			"lists the run id of every run holding at least one event",
			listsTheRunIdOfEveryRunHoldingAtLeastOneEvent,
		);
	});
});
