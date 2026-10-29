import {
	BOUNDARY_ABSENT,
	TRANSCRIPT_ABSENT,
	unreadableLineReason,
} from "./session-history-request-contract";
import type {
	SessionHistoryAttemptTotals,
	SessionHistoryRequestEntry,
	SessionHistoryUnreadableLine,
} from "./session-history-request-contract";
import { totalInputTokens } from "./session-history-request-row";

const INITIAL_COUNTED_REQUEST_COUNT = 0;

const EMPTY_REASON_COUNT = 0;

const INITIAL_ATTEMPT_REQUEST_COUNT = 0;

/** The series is the root's, which carries no sub-agent id. */
const ROOT_AGENT = undefined;

class AttemptUsageTotals {
	private readonly usage = {
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		inputTokens: 0,
		outputTokens: 0,
	};
	private counted = INITIAL_COUNTED_REQUEST_COUNT;
	private requestCount = INITIAL_ATTEMPT_REQUEST_COUNT;
	private readonly unreadable: string[] = [];
	/** An unreadable attempt line may hold a request whose usage is unseen. */
	public observeUnreadable({
		line,
		region,
	}: Readonly<SessionHistoryUnreadableLine>): void {
		if (region === "attempt") {
			this.unreadable.push(unreadableLineReason(ROOT_AGENT, line));
		}
	}
	public observe(entry: Readonly<SessionHistoryRequestEntry>): void {
		if (entry.region !== "attempt") {
			return;
		}
		this.requestCount += 1;
		if (entry.usageState === "complete") {
			this.counted += 1;
			this.usage.inputTokens += entry.usage.inputTokens;
			this.usage.outputTokens += entry.usage.outputTokens;
			this.usage.cacheReadTokens += entry.usage.cacheReadTokens;
			this.usage.cacheWriteTokens += entry.usage.cacheWriteTokens;
		}
	}
	public reading(): SessionHistoryAttemptTotals {
		const totals = {
			requestCount: this.requestCount,
			totalInputTokens: totalInputTokens(this.usage),
			usage: this.usage,
		};
		const reasons = [...this.unsettledReasons(), ...this.unreadable];
		if (reasons.length === EMPTY_REASON_COUNT) {
			return { state: "complete", ...totals };
		}

		return {
			state: "incomplete",
			...totals,
			countedRequestCount: this.counted,
			reasons,
		};
	}
	private unsettledReasons(): readonly string[] {
		return this.counted === this.requestCount
			? []
			: [
					`${this.requestCount - this.counted} of ${this.requestCount} attempt-region requests carry no settled usage`,
				];
	}
}

function attemptTotals(
	{
		entries,
		unreadableLines,
	}: {
		readonly entries: readonly SessionHistoryRequestEntry[];
		readonly unreadableLines: readonly SessionHistoryUnreadableLine[];
	},
	boundary: "known" | "unknown",
	transcriptState: "saved" | "absent",
): SessionHistoryAttemptTotals {
	if (transcriptState === "absent") {
		return { reasons: [TRANSCRIPT_ABSENT], state: "unavailable" };
	}
	if (boundary === "unknown") {
		return { reasons: [BOUNDARY_ABSENT], state: "unavailable" };
	}
	const totals = new AttemptUsageTotals();
	for (const entry of entries) {
		totals.observe(entry);
	}
	for (const line of unreadableLines) {
		totals.observeUnreadable(line);
	}
	return totals.reading();
}

export { attemptTotals as default };
