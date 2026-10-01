import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JudgeProgress } from "./run-events";
import {
	isTerminalRunEventKind,
	openRunEventStore,
	runEventRecorderFor,
} from "./run-events";
import { createSpendCeiling } from "./spend-ceiling";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

describe(openRunEventStore.name, () => {
	it("opens a file-backed database in WAL mode, per decision-3", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-run-events-"));
		testResources.track(directory);

		const store = await openRunEventStore(join(directory, "events.sqlite"));

		expect(store.journalMode()).toBe("wal");
		store.close();
	});

	it("creates a database file's parent directory when it does not exist yet, since the runs directory is never created ahead of the first run", async () => {
		const parent = await mkdtemp(join(tmpdir(), "rehearse-run-events-"));
		testResources.track(parent);
		const path = join(parent, "not-yet-created", "events.sqlite");

		const store = await openRunEventStore(path);

		expect(await Bun.file(path).exists()).toBe(true);
		store.close();
	});

	it("replays every appended event for a run in append order", async () => {
		const store = await openRunEventStore(":memory:");

		store.append({
			runId: "run-1",
			kind: "stage-started",
			stage: "shape",
			spentUsd: 0,
			elapsedMs: 0,
		});
		store.append({
			runId: "run-1",
			kind: "turn-completed",
			stage: "shape",
			spentUsd: 0.5,
			elapsedMs: 1000,
		});

		expect(
			store.eventsSince("run-1", 0).map(({ kind, spentUsd }) => ({
				kind,
				spentUsd,
			})),
		).toEqual([
			{ kind: "stage-started", spentUsd: 0 },
			{ kind: "turn-completed", spentUsd: 0.5 },
		]);
		store.close();
	});

	it("keeps events for different runs separate", async () => {
		const store = await openRunEventStore(":memory:");

		store.append({
			runId: "run-1",
			kind: "stage-started",
			stage: "shape",
			spentUsd: 0,
			elapsedMs: 0,
		});
		store.append({
			runId: "run-2",
			kind: "stage-started",
			stage: "discuss",
			spentUsd: 0,
			elapsedMs: 0,
		});

		expect(store.eventsSince("run-1", 0)).toHaveLength(1);
		expect(store.eventsSince("run-2", 0)).toHaveLength(1);
		store.close();
	});

	it("returns only events after the requested sequence, for a reader that reconnects mid-stream", async () => {
		const store = await openRunEventStore(":memory:");

		store.append({
			runId: "run-1",
			kind: "stage-started",
			stage: "shape",
			spentUsd: 0,
			elapsedMs: 0,
		});
		const [first] = store.eventsSince("run-1", 0);
		store.append({
			runId: "run-1",
			kind: "turn-completed",
			stage: "shape",
			spentUsd: 0.5,
			elapsedMs: 1000,
		});

		expect(
			store.eventsSince("run-1", first?.sequence ?? 0).map(({ kind }) => kind),
		).toEqual(["turn-completed"]);
		store.close();
	});

	it("reports the latest event recorded for a run", async () => {
		const store = await openRunEventStore(":memory:");

		store.append({
			runId: "run-1",
			kind: "stage-started",
			stage: "shape",
			spentUsd: 0,
			elapsedMs: 0,
		});
		store.append({
			runId: "run-1",
			kind: "run-completed",
			stage: "shape",
			spentUsd: 1,
			elapsedMs: 2000,
		});

		expect(store.latestEvent("run-1")?.kind).toBe("run-completed");
		store.close();
	});

	it("reports no latest event for a run nothing was appended to", async () => {
		const store = await openRunEventStore(":memory:");

		expect(store.latestEvent("run-1")).toBeUndefined();
		store.close();
	});

	it("lists the run id of every run holding at least one event", async () => {
		const store = await openRunEventStore(":memory:");
		store.append({
			runId: "run-1",
			kind: "stage-started",
			stage: "shape",
			spentUsd: 0,
			elapsedMs: 0,
		});
		store.append({
			runId: "run-2",
			kind: "stage-started",
			stage: "discuss",
			spentUsd: 0,
			elapsedMs: 0,
		});

		expect(store.runIds().toSorted()).toEqual(["run-1", "run-2"]);
		store.close();
	});
});

const RETURNING: JudgeProgress = {
	state: "returning",
	attempt: 1,
	sections: {
		hardBlockers: { returned: 1, total: 4 },
		requirements: { returned: 0, total: 3 },
		dimensions: { returned: 2, total: 5 },
	},
};

describe("run event store judge progress", () => {
	it("keeps a judge progress event's counts and serves them back", async () => {
		const store = await openRunEventStore(":memory:");

		store.append({
			runId: "run-1",
			kind: "judge-progress",
			stage: "build",
			spentUsd: 1,
			elapsedMs: 10,
			judge: RETURNING,
		});

		expect(store.latestEvent("run-1")).toMatchObject({
			kind: "judge-progress",
			judge: RETURNING,
		});
		store.close();
	});

	it("opens a store created before judge progress, keeps its events and records new ones", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-run-events-"));
		testResources.track(directory);
		const path = join(directory, "events.sqlite");
		const old = new Database(path);
		old.run(`CREATE TABLE run_events (
			sequence INTEGER PRIMARY KEY AUTOINCREMENT,
			run_id TEXT NOT NULL,
			kind TEXT NOT NULL,
			stage TEXT NOT NULL,
			spent_usd REAL NOT NULL,
			elapsed_ms INTEGER NOT NULL,
			recorded_at TEXT NOT NULL
		)`);
		old.run(
			"INSERT INTO run_events (run_id, kind, stage, spent_usd, elapsed_ms, recorded_at) VALUES ('run-1', 'stage-judging', 'build', 1, 5, '2026-09-27T00:00:00.000Z')",
		);
		old.close();

		const store = await openRunEventStore(path);
		store.append({
			runId: "run-1",
			kind: "judge-progress",
			stage: "build",
			spentUsd: 1,
			elapsedMs: 10,
			judge: { state: "rejected", attempt: 1, reason: "unknown id" },
		});

		expect(
			store.eventsSince("run-1", 0).map(({ kind, judge }) => ({ kind, judge })),
		).toEqual([
			{ kind: "stage-judging", judge: undefined },
			{
				kind: "judge-progress",
				judge: { state: "rejected", attempt: 1, reason: "unknown id" },
			},
		]);
		store.close();
	});
});

describe("run event store run spend", () => {
	it("opens a store created before run spend, reads its events with none and records it and the run's tokens on new ones", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-run-events-"));
		testResources.track(directory);
		const path = join(directory, "events.sqlite");
		const old = new Database(path);
		old.run(`CREATE TABLE run_events (
			sequence INTEGER PRIMARY KEY AUTOINCREMENT,
			run_id TEXT NOT NULL,
			kind TEXT NOT NULL,
			stage TEXT NOT NULL,
			spent_usd REAL NOT NULL,
			elapsed_ms INTEGER NOT NULL,
			recorded_at TEXT NOT NULL,
			judge_progress TEXT
		)`);
		old.run(
			"INSERT INTO run_events (run_id, kind, stage, spent_usd, elapsed_ms, recorded_at) VALUES ('run-1', 'stage-started', 'build', 0, 5, '2026-09-30T00:00:00.000Z')",
		);
		old.close();

		const store = await openRunEventStore(path);
		store.append({
			runId: "run-1",
			kind: "turn-completed",
			stage: "build",
			spentUsd: 1,
			runSpentUsd: 1.5,
			runTokens: { input: 120, output: 30 },
			elapsedMs: 10,
		});

		expect(
			store.eventsSince("run-1", 0).map(({ kind, runSpentUsd, runTokens }) => ({
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
	});
});

describe("run event store stage session id", () => {
	it("opens a store created before stage session ids, reads its events with none and records one on a new stage start", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-run-events-"));
		testResources.track(directory);
		const path = join(directory, "events.sqlite");
		const old = new Database(path);
		old.run(`CREATE TABLE run_events (
			sequence INTEGER PRIMARY KEY AUTOINCREMENT,
			run_id TEXT NOT NULL,
			kind TEXT NOT NULL,
			stage TEXT NOT NULL,
			spent_usd REAL NOT NULL,
			elapsed_ms INTEGER NOT NULL,
			recorded_at TEXT NOT NULL,
			judge_progress TEXT
		)`);
		old.run(
			"INSERT INTO run_events (run_id, kind, stage, spent_usd, elapsed_ms, recorded_at) VALUES ('run-1', 'stage-started', 'shape', 0, 5, '2026-09-30T00:00:00.000Z')",
		);
		old.close();

		const store = await openRunEventStore(path);
		store.append({
			runId: "run-1",
			kind: "stage-started",
			stage: "build",
			spentUsd: 1,
			sessionId: "0b7e8d0c-2f4c-4a54-9a3e-6f1d2c3b4a59",
			elapsedMs: 10,
		});

		expect(
			store.eventsSince("run-1", 0).map(({ stage, sessionId }) => ({
				stage,
				sessionId,
			})),
		).toEqual([
			{ stage: "shape", sessionId: undefined },
			{ stage: "build", sessionId: "0b7e8d0c-2f4c-4a54-9a3e-6f1d2c3b4a59" },
		]);
		store.close();
	});
});

describe(runEventRecorderFor.name, () => {
	it("records a stage start with the id of the session the stage runs under", async () => {
		const store = await openRunEventStore(":memory:");

		runEventRecorderFor(
			store,
			"run-1",
			createSpendCeiling({ ceilingUsd: 10 }),
		).recordStageStarted(
			"build",
			1,
			2000,
			"0b7e8d0c-2f4c-4a54-9a3e-6f1d2c3b4a59",
		);

		expect(
			store.latestStageStart({ runId: "run-1", stage: "build" }),
		).toMatchObject({
			kind: "stage-started",
			spentUsd: 1,
			elapsedMs: 2000,
			sessionId: "0b7e8d0c-2f4c-4a54-9a3e-6f1d2c3b4a59",
		});
		store.close();
	});

	it("appends every recorded call to the store under the fixed run id", async () => {
		const store = await openRunEventStore(":memory:");
		const recorder = runEventRecorderFor(
			store,
			"run-1",
			createSpendCeiling({ ceilingUsd: 10 }),
		);

		recorder.record("stage-started", "shape", 0, 0);
		recorder.record("stage-completed", "shape", 1, 1000);

		expect(
			store
				.eventsSince("run-1", 0)
				.map(({ kind, stage, spentUsd, elapsedMs }) => ({
					kind,
					stage,
					spentUsd,
					elapsedMs,
				})),
		).toEqual([
			{ kind: "stage-started", stage: "shape", spentUsd: 0, elapsedMs: 0 },
			{ kind: "stage-completed", stage: "shape", spentUsd: 1, elapsedMs: 1000 },
		]);
		store.close();
	});

	it("stamps every event with the run spend its ceiling has charged so far", async () => {
		const store = await openRunEventStore(":memory:");
		const ceiling = createSpendCeiling({ ceilingUsd: 10 });
		const recorder = runEventRecorderFor(store, "run-1", ceiling);

		ceiling.charge(1.25);
		recorder.record("turn-completed", "build", 1.25, 1000);
		ceiling.charge(0.5);
		recorder.record("stage-completed", "build", 1.75, 2000);

		expect(
			store.eventsSince("run-1", 0).map(({ runSpentUsd }) => runSpentUsd),
		).toEqual([1.25, 1.75]);
		store.close();
	});

	it("stamps every event with the tokens its ceiling has tallied so far", async () => {
		const store = await openRunEventStore(":memory:");
		const ceiling = createSpendCeiling({ ceilingUsd: 10 });
		const recorder = runEventRecorderFor(store, "run-1", ceiling);

		ceiling.charge(1, {
			costUsd: 1,
			inputTokens: 100,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			outputTokens: 20,
			turns: 1,
		});
		recorder.record("turn-completed", "build", 1, 1000);

		expect(store.latestEvent("run-1")?.runTokens).toEqual({
			input: 100,
			output: 20,
		});
		store.close();
	});

	const reading = {
		state: "returning",
		attempt: 1,
		sections: {
			hardBlockers: { returned: 1, total: 2 },
			requirements: { returned: 0, total: 1 },
			dimensions: { returned: 3, total: 3 },
		},
	} as const;

	it("appends a judge progress reading with its counts", async () => {
		const store = await openRunEventStore(":memory:");

		runEventRecorderFor(
			store,
			"run-1",
			createSpendCeiling({ ceilingUsd: 10 }),
		).recordJudgeProgress("build", 2, 3000, reading);

		expect(store.eventsSince("run-1", 0)).toMatchObject([
			{
				kind: "judge-progress",
				stage: "build",
				spentUsd: 2,
				elapsedMs: 3000,
				judge: reading,
			},
		]);
		store.close();
	});

	it("drops a judge progress reading the store cannot take", async () => {
		const store = await openRunEventStore(":memory:");
		store.close();

		expect(() => {
			runEventRecorderFor(
				store,
				"run-1",
				createSpendCeiling({ ceilingUsd: 10 }),
			).recordJudgeProgress("build", 2, 3000, reading);
		}).not.toThrow();
	});
});

describe(isTerminalRunEventKind.name, () => {
	it.each([
		["run-completed", true],
		["run-failed", true],
		["run-interrupted", true],
		["stage-started", false],
		["stage-judging", false],
		["stage-completed", false],
		["turn-completed", false],
	] as const)("reads %s as terminal: %s", (kind, expected) => {
		expect(isTerminalRunEventKind(kind)).toBe(expected);
	});
});
