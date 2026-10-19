import { regionFor } from "./session-history-location";
import type { SessionHistoryRequestEntry } from "./session-history-request-contract";
import requestRows from "./session-history-request-groups";
import type { RequestRows } from "./session-history-request-groups";
import { totalInputTokens } from "./session-history-request-row";
import type { ParsedRequestRow } from "./session-history-request-row";

const INITIAL_CUMULATIVE_INPUT_TOKENS = 0;

class CumulativeRequestEntries {
	private readonly entries: SessionHistoryRequestEntry[] = [];
	private cumulative = INITIAL_CUMULATIVE_INPUT_TOKENS;
	public constructor(
		private readonly prefixLinesExcluded: number | undefined,
	) {}
	public observe(request: Readonly<RequestRows>): void {
		const entry = collapsedEntry(request, this.prefixLinesExcluded);
		if (entry.usageState === "complete") {
			this.cumulative += entry.totalInputTokens;
			this.entries.push({
				...entry,
				cumulativeTotalInputTokens: this.cumulative,
			});
		} else {
			this.entries.push(entry);
		}
	}
	public all(): readonly SessionHistoryRequestEntry[] {
		return this.entries;
	}
}

type CompleteUsageEntry = Extract<
	SessionHistoryRequestEntry,
	{ usageState: "complete" }
>;

type UnaccumulatedEntry =
	| Omit<CompleteUsageEntry, "cumulativeTotalInputTokens">
	| Extract<SessionHistoryRequestEntry, { usageState: "conflict" }>
	| Extract<SessionHistoryRequestEntry, { usageState: "incomplete" }>;

function collapsedEntry(
	request: Readonly<RequestRows>,
	prefixLinesExcluded: number | undefined,
): UnaccumulatedEntry {
	const { first, finalRow } = request;
	const identity = {
		line: first.line,
		region: regionFor(first.line, prefixLinesExcluded),
		requestId: first.requestId,
		...(request.modelConflict
			? { model: undefined, modelState: "conflict" as const }
			: { model: first.model }),
	};
	if (request.usageConflict) {
		return { ...identity, usageState: "conflict" };
	}
	if (finalRow === undefined) {
		return {
			...identity,
			lowerBound: request.last.usage,
			usageState: "incomplete",
		};
	}

	return {
		...identity,
		cacheWriteSplit: finalRow.cacheWriteSplit,
		totalInputTokens: totalInputTokens(finalRow.usage),
		usage: finalRow.usage,
		usageState: "complete",
	};
}

/**
 * The running total never resets. A compaction shortens the conversation the
 * provider sees without refunding the tokens already spent, so a reset would
 * read as a session that cost less than it did.
 */
function collapsedEntries(
	rows: readonly Readonly<ParsedRequestRow>[],
	prefixLinesExcluded: number | undefined,
): readonly SessionHistoryRequestEntry[] {
	const requests = requestRows(rows);
	const collapsed = new CumulativeRequestEntries(prefixLinesExcluded);
	for (const row of rows) {
		const request = requests.get(row);
		if (request !== undefined) {
			collapsed.observe(request);
		}
	}
	return collapsed.all();
}

export { collapsedEntries as default };
