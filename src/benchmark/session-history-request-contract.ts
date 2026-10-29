import type { HistoryRegion } from "./session-history-contract";

interface SessionHistoryRequestUsage {
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cacheReadTokens: number;
	readonly cacheWriteTokens: number;
}

type SessionHistoryCacheWriteSplit =
	| {
			readonly state: "complete";
			readonly fiveMinuteTokens: number;
			readonly oneHourTokens: number;
	  }
	| { readonly state: "missing"; readonly reasons: readonly string[] }
	| { readonly state: "conflict"; readonly reasons: readonly string[] };

type SessionHistoryRequestEntry = {
	readonly requestId: string | undefined;
	readonly line: number;
	readonly region: HistoryRegion;
	readonly model?: string | undefined;
	readonly modelState?: "conflict" | undefined;
} & (
	| {
			readonly usageState: "complete";
			readonly usage: SessionHistoryRequestUsage;
			readonly totalInputTokens: number;
			readonly cumulativeTotalInputTokens: number;
			readonly cacheWriteSplit: SessionHistoryCacheWriteSplit;
	  }
	| { readonly usageState: "conflict" }
	| {
			readonly usageState: "incomplete";
			readonly lowerBound: SessionHistoryRequestUsage;
	  }
);

type SessionHistoryAttemptTotals =
	| {
			readonly state: "complete";
			readonly requestCount: number;
			readonly usage: SessionHistoryRequestUsage;
			readonly totalInputTokens: number;
	  }
	| {
			readonly state: "incomplete";
			readonly requestCount: number;
			readonly countedRequestCount: number;
			readonly usage: SessionHistoryRequestUsage;
			readonly totalInputTokens: number;
			readonly reasons: readonly string[];
	  }
	| { readonly state: "unavailable"; readonly reasons: readonly string[] };

interface SessionHistoryRequestSeries {
	readonly name: "total input tokens";
	readonly measuresActiveContextWindow: false;
	readonly omits: readonly string[];
	readonly boundary: "known" | "unknown";
	readonly transcriptState: "saved" | "absent";
	readonly entries: readonly SessionHistoryRequestEntry[];
	readonly compactions: readonly SessionHistoryCompaction[];
	/** Lines that may hold a request the series could not read. */
	readonly unreadableLines: readonly SessionHistoryUnreadableLine[];
	readonly attemptTotals: SessionHistoryAttemptTotals;
}

const BOUNDARY_ABSENT = "the transcript carries no attempt boundary";

const NO_CATALOG = "no rate catalog was supplied";

const TRANSCRIPT_ABSENT = "the attempt has no saved transcript";

const USAGE_INCOMPLETE =
	"usage is incomplete: no row of the request carries a stop reason";

function unreadableLineReason(
	agentId: string | undefined,
	line: number,
): string {
	return agentId === undefined
		? `the attempt transcript's line ${line} cannot be read`
		: `sub-agent ${agentId}'s transcript line ${line} cannot be read`;
}

const TOTAL_INPUT_TOKENS_OMITS = [
	"the request's own output tokens",
	"the model's context window limit, which the transcript does not carry",
] as const;

interface SessionHistoryCompaction {
	readonly line: number;
	readonly trigger: string;
	readonly region: HistoryRegion;
}

interface SessionHistoryUnreadableLine {
	readonly line: number;
	readonly region: HistoryRegion;
}

interface SessionHistoryRequestSeriesInput {
	/** Absent means no transcript was saved, which is not an empty one. */
	readonly transcript: string | undefined;
	readonly prefixLinesExcluded: number | undefined;
}

type SessionHistoryRequestSeriesMetadata = Omit<
	SessionHistoryRequestSeriesInput,
	"transcript"
>;

interface RequestSeriesBoundary {
	readonly prefixLinesExcluded: number | undefined;
	readonly transcriptState: "saved" | "absent";
}

export {
	TRANSCRIPT_ABSENT,
	BOUNDARY_ABSENT,
	TOTAL_INPUT_TOKENS_OMITS,
	USAGE_INCOMPLETE,
	NO_CATALOG,
	unreadableLineReason,
};

export type {
	SessionHistoryRequestUsage,
	SessionHistoryCacheWriteSplit,
	SessionHistoryRequestEntry,
	SessionHistoryAttemptTotals,
	SessionHistoryRequestSeries,
	SessionHistoryCompaction,
	SessionHistoryUnreadableLine,
	SessionHistoryRequestSeriesInput,
	SessionHistoryRequestSeriesMetadata,
	RequestSeriesBoundary,
};
