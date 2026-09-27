import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

const runEventKindSchema = z.enum([
	"stage-started",
	"turn-completed",
	"stage-judging",
	"judge-progress",
	"stage-completed",
	"run-completed",
	"run-failed",
	"run-interrupted",
]);

export type RunEventKind = z.infer<typeof runEventKindSchema>;

/** Every kind but judge progress, which alone carries counts. */
export type PlainRunEventKind = Exclude<RunEventKind, "judge-progress">;

const TERMINAL_RUN_EVENT_KINDS = [
	"run-completed",
	"run-failed",
	"run-interrupted",
] as const satisfies readonly RunEventKind[];

export type TerminalRunEventKind = (typeof TERMINAL_RUN_EVENT_KINDS)[number];

/**
 * The kinds a run emits while it is still going. Named as the complement of
 * the terminal set rather than listed again, so a kind added to the enum
 * belongs to exactly one of the two without a second edit.
 */
export type NonTerminalRunEventKind = Exclude<
	RunEventKind,
	TerminalRunEventKind
>;

const TERMINAL_KIND_SET: ReadonlySet<RunEventKind> = new Set(
	TERMINAL_RUN_EVENT_KINDS,
);

/**
 * A run's event stream needs nothing further once it reaches one of these:
 * the SSE route stops polling, and reconciliation has nothing to do. The
 * single source both readers share, so a future RunEventKind added here
 * cannot desync which kinds end a stream between them.
 */
export function isTerminalRunEventKind(
	kind: RunEventKind,
): kind is TerminalRunEventKind {
	return TERMINAL_KIND_SET.has(kind);
}

const sectionCountSchema = z.object({
	returned: z.number().int().nonnegative(),
	total: z.number().int().nonnegative(),
});

/**
 * How far a stage judge's output has come back, counted per rubric section
 * from the items that closed and passed their own checks. A rejected attempt
 * withdraws its counts, and the next attempt starts again from none.
 */
export const judgeProgressSchema = z.discriminatedUnion("state", [
	z.object({
		state: z.literal("returning"),
		attempt: z.number().int().positive(),
		sections: z.object({
			hardBlockers: sectionCountSchema,
			requirements: sectionCountSchema,
			dimensions: sectionCountSchema,
		}),
	}),
	z.object({
		state: z.literal("rejected"),
		attempt: z.number().int().positive(),
		reason: z.string(),
	}),
]);

export type JudgeProgress = z.infer<typeof judgeProgressSchema>;
export type JudgeSectionCount = z.infer<typeof sectionCountSchema>;

interface RunEventFields {
	readonly runId: string;
	readonly stage: string;
	readonly spentUsd: number;
	readonly elapsedMs: number;
}

export type NewRunEvent = RunEventFields &
	(
		| {
				readonly kind: PlainRunEventKind;
				readonly judge?: undefined;
		  }
		| { readonly kind: "judge-progress"; readonly judge: JudgeProgress }
	);

export type RunEvent = NewRunEvent & {
	readonly sequence: number;
	readonly recordedAt: string;
};

export interface RunEventStore {
	readonly append: (event: NewRunEvent) => RunEvent;
	readonly eventsSince: (
		runId: string,
		sequence: number,
	) => readonly RunEvent[];
	readonly latestEvent: (runId: string) => RunEvent | undefined;
	readonly runIds: () => readonly string[];
	readonly journalMode: () => string;
	readonly close: () => void;
}

export interface RunEventRecorder {
	readonly record: (
		kind: PlainRunEventKind,
		stage: string,
		spentUsd: number,
		elapsedMs: number,
	) => void;
	readonly recordJudgeProgress: (
		stage: string,
		spentUsd: number,
		elapsedMs: number,
		judge: JudgeProgress,
	) => void;
}

/**
 * The port `run-abort.ts` and `workflow.ts` write through, so neither needs
 * to know the store exists: they see a recorder scoped to the one run they
 * are already running. The store is derived and disposable (GLOSSARY.md:
 * "the run artifact on disk remains authoritative"), so a failure recording
 * to it (e.g. transient SQLite contention from a concurrent reader) is
 * swallowed here rather than propagated into the caller's own control flow.
 */
export function runEventRecorderFor(
	store: RunEventStore,
	runId: string,
): RunEventRecorder {
	const append = (event: NewRunEvent): void => {
		try {
			store.append(event);
		} catch {
			// Best-effort: the event stream can drop an entry without
			// affecting the run it describes.
		}
	};

	return {
		record: (kind, stage, spentUsd, elapsedMs) => {
			append({ runId, kind, stage, spentUsd, elapsedMs });
		},
		recordJudgeProgress: (stage, spentUsd, elapsedMs, judge) => {
			append({
				runId,
				kind: "judge-progress",
				stage,
				spentUsd,
				elapsedMs,
				judge,
			});
		},
	};
}

const SCHEMA = `
	CREATE TABLE IF NOT EXISTS run_events (
		sequence INTEGER PRIMARY KEY AUTOINCREMENT,
		run_id TEXT NOT NULL,
		kind TEXT NOT NULL,
		stage TEXT NOT NULL,
		spent_usd REAL NOT NULL,
		elapsed_ms INTEGER NOT NULL,
		recorded_at TEXT NOT NULL,
		judge_progress TEXT
	);
	CREATE INDEX IF NOT EXISTS run_events_run_id ON run_events(run_id, sequence);
`;

/**
 * A store created before judge progress has no column for it. Adding a
 * nullable column keeps every row it holds and lets it record progress. The
 * column is added rather than checked for first, so two processes opening the
 * same old store at once cannot both find it missing and one fail to add it.
 */
function addJudgeProgressColumn(database: Database): void {
	try {
		database.run("ALTER TABLE run_events ADD COLUMN judge_progress TEXT");
	} catch (error) {
		if (!String(error).includes("duplicate column name")) {
			throw error;
		}
	}
}

interface RunEventRow {
	readonly sequence: number;
	readonly run_id: string;
	readonly kind: string;
	readonly stage: string;
	readonly spent_usd: number;
	readonly elapsed_ms: number;
	readonly recorded_at: string;
	readonly judge_progress: string | null;
}

function toRunEvent(row: RunEventRow): RunEvent {
	const fields = {
		sequence: row.sequence,
		runId: row.run_id,
		stage: row.stage,
		spentUsd: row.spent_usd,
		elapsedMs: row.elapsed_ms,
		recordedAt: row.recorded_at,
	};
	const kind = runEventKindSchema.parse(row.kind);
	if (kind === "judge-progress") {
		return {
			...fields,
			kind,
			judge: judgeProgressSchema.parse(JSON.parse(row.judge_progress ?? "")),
		};
	}

	return { ...fields, kind };
}

export async function openRunEventStore(path: string): Promise<RunEventStore> {
	if (path !== ":memory:") {
		await mkdir(dirname(path), { recursive: true });
	}
	const database = new Database(path);
	database.run("PRAGMA busy_timeout = 5000");
	database.run("PRAGMA journal_mode = WAL");
	database.run(SCHEMA);
	addJudgeProgressColumn(database);

	const selectJournalMode = database.query<{ journal_mode: string }, []>(
		"PRAGMA journal_mode",
	);
	const insert = database.query<
		RunEventRow,
		[string, RunEventKind, string, number, number, string, string | null]
	>(
		`INSERT INTO run_events (run_id, kind, stage, spent_usd, elapsed_ms, recorded_at, judge_progress)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 RETURNING *`,
	);
	const selectSince = database.query<RunEventRow, [string, number]>(
		"SELECT * FROM run_events WHERE run_id = ? AND sequence > ? ORDER BY sequence ASC",
	);
	const selectLatest = database.query<RunEventRow, [string]>(
		"SELECT * FROM run_events WHERE run_id = ? ORDER BY sequence DESC LIMIT 1",
	);
	const selectRunIds = database.query<{ run_id: string }, []>(
		"SELECT DISTINCT run_id FROM run_events",
	);

	return {
		append: (event) => {
			const row = insert.get(
				event.runId,
				event.kind,
				event.stage,
				event.spentUsd,
				event.elapsedMs,
				new Date().toISOString(),
				event.judge === undefined ? null : JSON.stringify(event.judge),
			);
			if (row === null) {
				throw new Error("Failed to append run event");
			}

			return toRunEvent(row);
		},
		eventsSince: (runId, sequence) =>
			selectSince.all(runId, sequence).map((row) => toRunEvent(row)),
		latestEvent: (runId) => {
			const row = selectLatest.get(runId);

			return row === null ? undefined : toRunEvent(row);
		},
		runIds: () => selectRunIds.all().map((row) => row.run_id),
		journalMode: () => selectJournalMode.get()?.journal_mode ?? "",
		close: () => {
			database.close();
		},
	};
}
