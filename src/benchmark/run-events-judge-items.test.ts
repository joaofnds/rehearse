import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import type { JudgeProgress } from "./run-events";
import { openRunEventStore } from "./run-events";
import RunEventBuilder from "./run-events-event-test-builder";
import {
	progressBeforeItems,
	readLegacyProgress,
} from "./run-events-legacy-test-fixture";
import ReturningJudgeProgressBuilder from "./run-events-progress-test-builder";
import RunEventResources from "./run-events-test-resources";

const resources = RunEventResources.forEachTest();

const RETURNING: JudgeProgress = new ReturningJudgeProgressBuilder({}).build();

const withItems: JudgeProgress = new ReturningJudgeProgressBuilder({
	items: {
		dimensions: [{ grade: "B", id: "scope" }, { id: "hygiene" }],
		hardBlockers: [{ id: "no-secrets", status: "FAIL" }, { id: "tests-pass" }],
	},
}).build();

async function readsProgressRecordedBeforePerItemResultsAsItsCountsAlone(): Promise<void> {
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

	expect(store.latestEvent("run-1")?.judge).toEqual(RETURNING);
	store.close();
}

async function keepsEachReturnedItemSResultAndServesItBack(): Promise<void> {
	const store = resources.own(await openRunEventStore(":memory:"));

	store.append(
		new RunEventBuilder({
			elapsedMs: 10,
			judge: withItems,
			kind: "judge-progress",
			spentUsd: 1,
			stage: "build",
		}).build(),
	);

	expect(store.latestEvent("run-1")?.judge).toEqual(withItems);
	store.close();
}

async function recordsProgressAReaderBuiltBeforePerItemResultsStillReadsAsCounts(): Promise<void> {
	const directory = await resources.directory();
	const path = join(directory, "events.sqlite");
	const store = resources.own(await openRunEventStore(path));
	store.append(
		new RunEventBuilder({
			elapsedMs: 10,
			judge: withItems,
			kind: "judge-progress",
			spentUsd: 1,
			stage: "build",
		}).build(),
	);
	store.close();

	const progress = readLegacyProgress(path);

	expect(progressBeforeItems.parse(JSON.parse(progress))).toEqual(RETURNING);
}

describe(openRunEventStore.name, () => {
	describe("when the progress record includes optional item results", () => {
		it(
			"reads progress recorded before per-item results as its counts alone",
			readsProgressRecordedBeforePerItemResultsAsItsCountsAlone,
		);
		it(
			"keeps each returned item's result and serves it back",
			keepsEachReturnedItemSResultAndServesItBack,
		);
		it(
			"records progress a reader built before per-item results still reads as counts",
			recordsProgressAReaderBuiltBeforePerItemResultsStillReadsAsCounts,
		);
	});
});
