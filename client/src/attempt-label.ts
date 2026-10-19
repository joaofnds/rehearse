import type { RunHistoryResponse } from "#client/run-history/run-history-query";

/**
 * Which attempt at its checkpoint a record is, or which rep of its group, in
 * the shape the run history route serves it.
 */
type AttemptPosition = NonNullable<
	Extract<RunHistoryResponse["rows"][number], { kind: "replay" }>["attempt"]
>;

function attemptLabel({ position, count }: AttemptPosition): string {
	return `attempt ${String(position)} of ${String(count)}`;
}

export { attemptLabel as default };
export type { AttemptPosition };
