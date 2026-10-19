import type {
	SessionHistoryCompaction,
	SessionHistoryRequestEntry,
} from "#benchmark/session-history";

function requestRowId(entry: SessionHistoryRequestEntry): string {
	return `${entry.line}`;
}

/**
 * One rule, read in both directions: a request owns the transcript lines from
 * its own line until the next request's. Every pane selects through it, so they
 * cannot disagree about which request a line belongs to.
 */
function requestRowForLine(
	entries: readonly SessionHistoryRequestEntry[],
	line: number | undefined,
): string | undefined {
	if (line === undefined) {
		return undefined;
	}
	let owner: SessionHistoryRequestEntry | undefined = undefined;
	for (const entry of entries) {
		if (entry.line <= line) {
			owner = entry;
		}
	}

	return owner === undefined ? undefined : requestRowId(owner);
}

/**
 * A compaction is recorded on its own transcript line, never on a request's,
 * so matching the two line numbers marks nothing. The request that owns the
 * line is the one that was in flight when the compaction happened.
 */
function compactingRequestIds(
	entries: readonly SessionHistoryRequestEntry[],
	compactions: readonly SessionHistoryCompaction[],
): ReadonlySet<string> {
	const owners = compactions.map((compaction) =>
		requestRowForLine(entries, compaction.line),
	);

	return new Set(owners.filter((id) => id !== undefined));
}

/**
 * Measured over every entry rather than the filtered rows, so filtering the
 * panes does not rescale the bars and make a narrowed view look different
 * from the same requests in the full one.
 */
function widestTotal(entries: readonly SessionHistoryRequestEntry[]): number {
	let widest = 0;
	for (const entry of entries) {
		if (entry.usageState === "complete") {
			widest = Math.max(widest, entry.totalInputTokens);
		}
	}

	return widest;
}

export { compactingRequestIds, requestRowForLine, requestRowId, widestTotal };
