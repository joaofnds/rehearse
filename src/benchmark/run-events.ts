import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { stageLetterGradeSchema } from "./contracts";
import type { RunTokens, SpendCeiling } from "./spend-ceiling";

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
 * Every rubric item of a section in rubric order, each with its result once
 * it has returned and nothing while it is pending.
 */
const returnedItemsSchema = z.object({
	hardBlockers: z
		.array(
			z.object({
				id: z.string(),
				status: z.enum(["PASS", "FAIL"]).optional(),
			}),
		)
		.readonly(),
	dimensions: z
		.array(
			z.object({ id: z.string(), grade: stageLetterGradeSchema.optional() }),
		)
		.readonly(),
});

/**
 * How far a stage judge's output has come back, counted per rubric section
 * from the items that closed and passed their own checks. A rejected attempt
 * withdraws its counts, and the next attempt starts again from none. The
 * items are undefined on progress recorded before they existed.
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
		items: returnedItemsSchema.optional(),
	}),
	z.object({
		state: z.literal("rejected"),
		attempt: z.number().int().positive(),
		reason: z.string(),
	}),
]);

export type JudgeProgress = z.infer<typeof judgeProgressSchema>;
export type JudgeSectionCount = z.infer<typeof sectionCountSchema>;
export type ReturnedItems = z.infer<typeof returnedItemsSchema>;

interface RunEventFields {
	readonly runId: string;
	readonly stage: string;
	readonly spentUsd: number;
	/**
	 * What the run's ceiling has charged when the event is recorded, Judges
	 * and the Product Owner included, unlike `spentUsd`, whose scope depends
	 * on the kind. Undefined on events recorded before it existed. An
	 * interruption reconciliation writes from outside the run carries the
	 * figure of the run's last event.
	 */
	readonly runSpentUsd?: number | undefined;
	/** The run's tokens as its ceiling tallies them, with `runSpentUsd`'s reach. */
	readonly runTokens?: RunTokens | undefined;
	readonly elapsedMs: number;
}

export type NewRunEvent = RunEventFields &
	(
		| {
				readonly kind: Exclude<PlainRunEventKind, "stage-started">;
				readonly judge?: undefined;
				readonly sessionId?: undefined;
		  }
		| {
				readonly kind: "stage-started";
				readonly judge?: undefined;
				/**
				 * The provider session the stage runs under, which names its
				 * transcript on disk. Undefined on events recorded before it existed.
				 */
				readonly sessionId?: string | undefined;
		  }
		| {
				readonly kind: "judge-progress";
				readonly judge: JudgeProgress;
				readonly sessionId?: undefined;
		  }
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
	readonly firstEvent: (runId: string) => RunEvent | undefined;
	readonly latestEvent: (runId: string) => RunEvent | undefined;
	/** The newest stage-started event of this stage of this run, if any. */
	readonly latestStageStart: (stageOfRun: {
		readonly runId: string;
		readonly stage: string;
	}) => RunEvent | undefined;
	readonly runIds: () => readonly string[];
	readonly journalMode: () => string;
	readonly close: () => void;
}

export interface RunEventRecorder {
	readonly record: (
		kind: Exclude<PlainRunEventKind, "stage-started">,
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
	readonly recordStageStarted: (
		stage: string,
		spentUsd: number,
		elapsedMs: number,
		sessionId: string,
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
	ceiling: Pick<SpendCeiling, "spentUsd" | "tokens">,
): RunEventRecorder {
	const append = (event: NewRunEvent): void => {
		try {
			store.append({
				...event,
				runSpentUsd: ceiling.spentUsd(),
				runTokens: ceiling.tokens(),
			});
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
		recordStageStarted: (stage, spentUsd, elapsedMs, sessionId) => {
			append({
				runId,
				kind: "stage-started",
				stage,
				spentUsd,
				elapsedMs,
				sessionId,
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

interface RunEventRow {
	readonly sequence: number;
	readonly run_id: string;
	readonly kind: string;
	readonly stage: string;
	readonly spent_usd: number;
	readonly elapsed_ms: number;
	readonly recorded_at: string;
	readonly judge_progress: string | null;
	readonly run_spent_usd: number | null;
	readonly run_input_tokens: number | null;
	readonly run_output_tokens: number | null;
	readonly session_id: string | null;
}

function runTokensOf(row: RunEventRow): RunTokens | undefined {
	if (row.run_input_tokens === null || row.run_output_tokens === null) {
		return undefined;
	}

	return { input: row.run_input_tokens, output: row.run_output_tokens };
}

function toRunEvent(row: RunEventRow): RunEvent {
	const fields = {
		sequence: row.sequence,
		runId: row.run_id,
		stage: row.stage,
		spentUsd: row.spent_usd,
		runSpentUsd: row.run_spent_usd ?? undefined,
		runTokens: runTokensOf(row),
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
	if (kind === "stage-started") {
		return { ...fields, kind, sessionId: row.session_id ?? undefined };
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
	addNullableColumn(database, "judge_progress TEXT");
	addNullableColumn(database, "run_spent_usd REAL");
	addNullableColumn(database, "run_input_tokens INTEGER");
	addNullableColumn(database, "run_output_tokens INTEGER");
	addNullableColumn(database, "session_id TEXT");

	const selectJournalMode = database.query<{ journal_mode: string }, []>(
		"PRAGMA journal_mode",
	);
	const insert = database.query<
		RunEventRow,
		[
			string,
			RunEventKind,
			string,
			number,
			number,
			string,
			string | null,
			number | null,
			number | null,
			number | null,
			string | null,
		]
	>(
		`INSERT INTO run_events (run_id, kind, stage, spent_usd, elapsed_ms, recorded_at, judge_progress, run_spent_usd, run_input_tokens, run_output_tokens, session_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 RETURNING *`,
	);
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
				event.runSpentUsd ?? null,
				event.runTokens?.input ?? null,
				event.runTokens?.output ?? null,
				event.sessionId ?? null,
			);
			if (row === null) {
				throw new Error("Failed to append run event");
			}

			return toRunEvent(row);
		},
		eventsSince: (runId, sequence) =>
			selectSince.all(runId, sequence).map((row) => toRunEvent(row)),
		firstEvent: (runId) => {
			const row = selectFirst.get(runId);

			return row === null ? undefined : toRunEvent(row);
		},
		latestEvent: (runId) => {
			const row = selectLatest.get(runId);

			return row === null ? undefined : toRunEvent(row);
		},
		latestStageStart: ({ runId, stage }) => {
			const row = selectLatestStageStart.get(runId, stage);

			return row === null ? undefined : toRunEvent(row);
		},
		runIds: () => selectRunIds.all().map((row) => row.run_id),
		journalMode: () => selectJournalMode.get()?.journal_mode ?? "",
		close: () => {
			database.close();
		},
	};
}
