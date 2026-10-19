import { Database } from "bun:sqlite";

import { z } from "zod";

interface LegacyStoreRequest {
	readonly path: string;
	readonly schema: string;
	readonly insert: string;
}

function seedLegacyRunEvents({
	path,
	schema,
	insert,
}: LegacyStoreRequest): void {
	const database = new Database(path);
	try {
		database.run(schema);
		database.run(insert);
	} finally {
		database.close();
	}
}

function seedEventsBeforeJudgeProgress(path: string): void {
	seedLegacyRunEvents({
		insert:
			"INSERT INTO run_events (run_id, kind, stage, spent_usd, elapsed_ms, recorded_at) VALUES ('run-1', 'stage-judging', 'build', 1, 5, '2026-09-27T00:00:00.000Z')",
		path,
		schema: `CREATE TABLE run_events (
			sequence INTEGER PRIMARY KEY AUTOINCREMENT,
			run_id TEXT NOT NULL,
			kind TEXT NOT NULL,
			stage TEXT NOT NULL,
			spent_usd REAL NOT NULL,
			elapsed_ms INTEGER NOT NULL,
			recorded_at TEXT NOT NULL
		)`,
	});
}
function seedEventsBeforeRunSpend(path: string): void {
	seedLegacyRunEvents({
		insert:
			"INSERT INTO run_events (run_id, kind, stage, spent_usd, elapsed_ms, recorded_at) VALUES ('run-1', 'stage-started', 'build', 0, 5, '2026-09-30T00:00:00.000Z')",
		path,
		schema: `CREATE TABLE run_events (
			sequence INTEGER PRIMARY KEY AUTOINCREMENT,
			run_id TEXT NOT NULL,
			kind TEXT NOT NULL,
			stage TEXT NOT NULL,
			spent_usd REAL NOT NULL,
			elapsed_ms INTEGER NOT NULL,
			recorded_at TEXT NOT NULL,
			judge_progress TEXT
		)`,
	});
}
function seedEventsBeforeSessionIds(path: string): void {
	seedLegacyRunEvents({
		insert:
			"INSERT INTO run_events (run_id, kind, stage, spent_usd, elapsed_ms, recorded_at) VALUES ('run-1', 'stage-started', 'shape', 0, 5, '2026-09-30T00:00:00.000Z')",
		path,
		schema: `CREATE TABLE run_events (
			sequence INTEGER PRIMARY KEY AUTOINCREMENT,
			run_id TEXT NOT NULL,
			kind TEXT NOT NULL,
			stage TEXT NOT NULL,
			spent_usd REAL NOT NULL,
			elapsed_ms INTEGER NOT NULL,
			recorded_at TEXT NOT NULL,
			judge_progress TEXT
		)`,
	});
}
const sectionCount = z.object({ returned: z.number(), total: z.number() });
const progressBeforeItems = z.discriminatedUnion("state", [
	z.object({
		attempt: z.number(),
		sections: z.object({
			dimensions: sectionCount,
			hardBlockers: sectionCount,
			requirements: sectionCount,
		}),
		state: z.literal("returning"),
	}),
	z.object({
		attempt: z.number(),
		reason: z.string(),
		state: z.literal("rejected"),
	}),
]);
function readLegacyProgress(path: string): string {
	const database = new Database(path);
	try {
		const row = database
			.query<{ readonly judge_progress: string }, []>(
				"SELECT judge_progress FROM run_events",
			)
			.get();
		return row?.judge_progress ?? "";
	} finally {
		database.close();
	}
}
export {
	seedEventsBeforeJudgeProgress,
	seedEventsBeforeRunSpend,
	seedEventsBeforeSessionIds,
	progressBeforeItems,
	readLegacyProgress,
};
