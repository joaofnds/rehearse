import type { ClaudeCallMetrics } from "#benchmark/contracts";
import type { SessionHistoryReportMetadata } from "#benchmark/session-history";

interface AttemptReadings {
	readonly metadata: SessionHistoryReportMetadata;
	readonly reportedCostUsd: number | undefined;
	readonly modelUsage: ClaudeCallMetrics["modelUsage"];
}

interface ResolvedHistoryInput {
	readonly root: string;
	readonly metadata: SessionHistoryReportMetadata;
	readonly reportedCostUsd: number | undefined;
	readonly transcriptFile: string | undefined;
}

/** A saved session attempt, whose record directory may hold sub-agent files. */
interface ResolvedAttemptInput extends ResolvedHistoryInput {
	readonly directory: string;
	readonly modelUsage: ClaudeCallMetrics["modelUsage"];
}

export type { AttemptReadings, ResolvedHistoryInput, ResolvedAttemptInput };
