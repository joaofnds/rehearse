import type { Database, Statement } from "bun:sqlite";

import type { RunEventKind } from "./run-events-kinds";
import type { RunEventRow } from "./run-events-sqlite-row";

const SCHEMA = `
	CREATE TABLE IF NOT EXISTS run_events (
		sequence INTEGER PRIMARY KEY AUTOINCREMENT,
		run_id TEXT NOT NULL,
		kind TEXT NOT NULL,
		stage TEXT NOT NULL,
		spent_usd REAL NOT NULL,
		elapsed_ms INTEGER NOT NULL,
		recorded_at TEXT NOT NULL,
		judge_progress TEXT,
		run_spent_usd REAL,
		run_input_tokens INTEGER,
		run_output_tokens INTEGER,
		session_id TEXT
	);
	CREATE INDEX IF NOT EXISTS run_events_run_id ON run_events(run_id, sequence);
`;

/**
 * A store created before a column existed has no room for it. Adding it
 * nullable keeps every row the store holds and lets it record the new field.
 * The column is added rather than checked for first, so two processes opening
 * the same old store at once cannot both find it missing and one fail to add
 * it.
 */
function addNullableColumn(database: Database, definition: string): void {
	try {
		database.run(`ALTER TABLE run_events ADD COLUMN ${definition}`);
	} catch (error) {
		if (!String(error).includes("duplicate column name")) {
			throw error;
		}
	}
}

type RunEventBindings = [
	runId: string,
	kind: RunEventKind,
	stage: string,
	spentUsd: number,
	elapsedMs: number,
	recordedAt: string,
	judgeProgress: string | null,
	runSpentUsd: number | null,
	runInputTokens: number | null,
	runOutputTokens: number | null,
	sessionId: string | null,
];

interface RunEventQueries {
	readonly insert: Pick<Statement<RunEventRow, RunEventBindings>, "get">;
	readonly selectSince: Pick<Statement<RunEventRow, [string, number]>, "all">;
	readonly selectFirst: Pick<Statement<RunEventRow, [string]>, "get">;
	readonly selectLatest: Pick<Statement<RunEventRow, [string]>, "get">;
	readonly selectLatestStageStart: Pick<
		Statement<RunEventRow, [string, string]>,
		"get"
	>;
	readonly selectRunIds: Pick<
		Statement<{ readonly run_id: string }, []>,
		"all"
	>;
	readonly selectJournalMode: Pick<
		Statement<{ readonly journal_mode: string }, []>,
		"get"
	>;
}

function initializeRunEventDatabase(database: Database): void {
	database.run("PRAGMA busy_timeout = 5000");
	database.run("PRAGMA journal_mode = WAL");
	database.run(SCHEMA);
	addNullableColumn(database, "judge_progress TEXT");
	addNullableColumn(database, "run_spent_usd REAL");
	addNullableColumn(database, "run_input_tokens INTEGER");
	addNullableColumn(database, "run_output_tokens INTEGER");
	addNullableColumn(database, "session_id TEXT");
}

function prepareInsert(database: Database): RunEventQueries["insert"] {
	return database.query<
		RunEventRow,
		RunEventBindings
	>(`INSERT INTO run_events (run_id, kind, stage, spent_usd, elapsed_ms, recorded_at, judge_progress, run_spent_usd, run_input_tokens, run_output_tokens, session_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 RETURNING *`);
}

function eventQueries(database: Database): RunEventQueries {
	const selectJournalMode = database.query<
		{ readonly journal_mode: string },
		[]
	>("PRAGMA journal_mode");
	const insert = prepareInsert(database);

	const selectSince = database.query<RunEventRow, [string, number]>(
		"SELECT * FROM run_events WHERE run_id = ? AND sequence > ? ORDER BY sequence ASC",
	);
	const selectFirst = database.query<RunEventRow, [string]>(
		"SELECT * FROM run_events WHERE run_id = ? ORDER BY sequence ASC LIMIT 1",
	);
	const selectLatest = database.query<RunEventRow, [string]>(
		"SELECT * FROM run_events WHERE run_id = ? ORDER BY sequence DESC LIMIT 1",
	);
	const selectLatestStageStart = database.query<RunEventRow, [string, string]>(
		"SELECT * FROM run_events WHERE run_id = ? AND kind = 'stage-started' AND stage = ? ORDER BY sequence DESC LIMIT 1",
	);
	const selectRunIds = database.query<{ readonly run_id: string }, []>(
		"SELECT DISTINCT run_id FROM run_events",
	);

	return {
		insert,
		selectFirst,
		selectJournalMode,
		selectLatest,
		selectLatestStageStart,
		selectRunIds,
		selectSince,
	};
}

export { eventQueries, initializeRunEventDatabase };
export type { RunEventQueries };
