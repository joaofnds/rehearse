import type { SessionHistoryReport } from "#benchmark/session-history";
import type { SessionHistoryAttemptSeries } from "#server/session-history-reader";

const originalFetch = globalThis.fetch;

function emptyHistory(caseId: string, id: string): SessionHistoryReport {
	return {
		attempt: {
			caseId,
			corpusFiles: [],
			id,
			kind: "session",
			model: "sonnet",
			outcome: "SUCCESSFUL",
		},
		attemptEvents: [],
		boundary: "known",
		boundaryUnknown: [],
		evidence: { state: "complete" },
		schemaVersion: 1,
		sources: [],
		startingContext: [],
		startingSources: [],
	};
}

function emptyRequestSeries(): SessionHistoryAttemptSeries {
	return {
		cost: {
			calculated: { costUsd: 0, state: "complete" },
			difference: { costUsd: 0, state: "complete" },
			reported: { costUsd: 0, state: "complete" },
			rootRequests: { costUsd: 0, state: "complete" },
		},
		instructionLoads: { state: "unavailable" },
		requestCosts: [],
		series: {
			attemptTotals: {
				requestCount: 0,
				state: "complete",
				totalInputTokens: 0,
				usage: {
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
					inputTokens: 0,
					outputTokens: 0,
				},
			},
			boundary: "known",
			compactions: [],
			entries: [],
			measuresActiveContextWindow: false,
			name: "total input tokens",
			omits: [],
			transcriptState: "saved",
			unreadableLines: [],
		},
	};
}

export { emptyHistory, emptyRequestSeries, originalFetch };
