import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import type {
	NewRunEvent,
	RunEvent,
	RunEventStore,
} from "./run-events-contracts";
import type { RunEventQueries } from "./run-events-sqlite-queries";
import {
	eventQueries,
	initializeRunEventDatabase,
} from "./run-events-sqlite-queries";
import toRunEvent from "./run-events-sqlite-row";

function appendEvent(
	insert: RunEventQueries["insert"],
	event: NewRunEvent,
): RunEvent {
	const row = insert.get(
		event.runId,
		event.kind,
		event.stage,
		event.spentUsd,
		event.elapsedMs,
		new Date().toISOString(),
		event.judge === undefined ? null : JSON.stringify(event.judge),
		event.runSpentUsd ?? null,
		event.runTokens?.input ?? null,
		event.runTokens?.output ?? null,
		event.sessionId ?? null,
	);
	if (row === null) {
		throw new Error("Failed to append run event");
	}

	return toRunEvent(row);
}

function storeForQueries(
	database: Database,
	queries: RunEventQueries,
): RunEventStore {
	return {
		append: (event) => appendEvent(queries.insert, event),
		close: () => {
			database.close();
		},
		eventsSince: (runId, sequence) =>
			queries.selectSince.all(runId, sequence).map((row) => toRunEvent(row)),
		firstEvent: (runId) => {
			const row = queries.selectFirst.get(runId);

			return row === null ? undefined : toRunEvent(row);
		},
		journalMode: () => queries.selectJournalMode.get()?.journal_mode ?? "",
		latestEvent: (runId) => {
			const row = queries.selectLatest.get(runId);

			return row === null ? undefined : toRunEvent(row);
		},
		latestStageStart: ({ runId, stage }) => {
			const row = queries.selectLatestStageStart.get(runId, stage);

			return row === null ? undefined : toRunEvent(row);
		},
		runIds: () => queries.selectRunIds.all().map((row) => row.run_id),
	};
}

async function openRunEventStore(path: string): Promise<RunEventStore> {
	if (path !== ":memory:") {
		await mkdir(dirname(path), { recursive: true });
	}

	const database = new Database(path);
	initializeRunEventDatabase(database);

	return storeForQueries(database, eventQueries(database));
}

export { openRunEventStore as default };
