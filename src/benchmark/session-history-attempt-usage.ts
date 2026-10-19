import {
	BOUNDARY_ABSENT,
	TRANSCRIPT_ABSENT,
} from "./session-history-request-contract";
import type {
	SessionHistoryAttemptTotals,
	SessionHistoryRequestEntry,
} from "./session-history-request-contract";
import { totalInputTokens } from "./session-history-request-row";

const INITIAL_COUNTED_REQUEST_COUNT = 0;

const INITIAL_ATTEMPT_REQUEST_COUNT = 0;

class AttemptUsageTotals {
	private readonly usage = {
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		inputTokens: 0,
		outputTokens: 0,
	};
	private counted = INITIAL_COUNTED_REQUEST_COUNT;
	private requestCount = INITIAL_ATTEMPT_REQUEST_COUNT;
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
		if (this.counted === this.requestCount) {
			return { state: "complete", ...totals };
		}

		return {
			state: "incomplete",
			...totals,
			countedRequestCount: this.counted,
			reasons: [
				`${this.requestCount - this.counted} of ${this.requestCount} attempt-region requests carry no settled usage`,
			],
		};
	}
}

function attemptTotals(
	entries: readonly SessionHistoryRequestEntry[],
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
	return totals.reading();
}

export { attemptTotals as default };
