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

type RunEventKind = z.infer<typeof runEventKindSchema>;

/** Every kind but judge progress, which alone carries counts. */
type PlainRunEventKind = Exclude<RunEventKind, "judge-progress">;

const TERMINAL_RUN_EVENT_KINDS = [
	"run-completed",
	"run-failed",
	"run-interrupted",
] as const satisfies readonly RunEventKind[];

type TerminalRunEventKind = (typeof TERMINAL_RUN_EVENT_KINDS)[number];

/**
 * The kinds a run emits while it is still going. Named as the complement of
 * the terminal set rather than listed again, so a kind added to the enum
 * belongs to exactly one of the two without a second edit.
 */
type NonTerminalRunEventKind = Exclude<RunEventKind, TerminalRunEventKind>;

const TERMINAL_KIND_SET: ReadonlySet<RunEventKind> = new Set(
	TERMINAL_RUN_EVENT_KINDS,
);

/**
 * A run's event stream needs nothing further once it reaches one of these:
 * the SSE route stops polling, and reconciliation has nothing to do. The
 * single source both readers share, so a future RunEventKind added here
 * cannot desync which kinds end a stream between them.
 */
function isTerminalRunEventKind(
	kind: RunEventKind,
): kind is TerminalRunEventKind {
	return TERMINAL_KIND_SET.has(kind);
}

export { runEventKindSchema, isTerminalRunEventKind };
export type {
	RunEventKind,
	PlainRunEventKind,
	TerminalRunEventKind,
	NonTerminalRunEventKind,
};
