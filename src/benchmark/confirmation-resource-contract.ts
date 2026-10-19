import type { ClaudeCallMetrics } from "./contracts";

const CALL_ROLES = [
	"worker",
	"product-owner",
	"stage-judge",
	"final-judge",
] as const;

type CallRole = (typeof CALL_ROLES)[number];

interface ConfirmationCallEvidence {
	readonly role: CallRole;
	readonly metrics: ClaudeCallMetrics;
}

interface ConfirmationResourceRep {
	readonly metrics:
		| {
				readonly status: "COMPLETE";
				readonly calls: readonly ConfirmationCallEvidence[];
		  }
		| {
				readonly status: "MISSING";
				readonly calls: readonly ConfirmationCallEvidence[];
				readonly missing: readonly string[];
		  };
	readonly workerTrajectorySteps: number;
	readonly elapsedMs: number;
	readonly stages: readonly {
		readonly stage: string;
		readonly elapsedMs?: number | undefined;
	}[];
}

interface MetricDistributions {
	readonly costUsd: readonly number[];
	readonly inputTokens: readonly number[];
	readonly outputTokens: readonly number[];
	readonly cacheReadTokens: readonly number[];
	readonly cacheWriteTokens: readonly number[];
}

interface ConfirmationResourceReport {
	readonly completeReps: number;
	readonly missingMetricReps: number;
	readonly perRole: Readonly<Record<CallRole, MetricDistributions>>;
	readonly total: MetricDistributions;
	readonly workerTurns: readonly number[];
	readonly stageElapsedMs: Readonly<Record<string, readonly number[]>>;
	readonly repElapsedMs: readonly number[];
	readonly makespanMs: number;
}

type ConfirmationCommandTotal =
	| {
			readonly status: "COMPLETE";
			readonly metrics: Omit<
				ClaudeCallMetrics,
				"turns" | "durationMs" | "apiDurationMs"
			>;
	  }
	| { readonly status: "MISSING"; readonly missing: readonly string[] };

interface MutableMetricDistributions {
	readonly costUsd: number[];
	readonly inputTokens: number[];
	readonly outputTokens: number[];
	readonly cacheReadTokens: number[];
	readonly cacheWriteTokens: number[];
}

export { CALL_ROLES as default };
export type {
	CallRole,
	ConfirmationCallEvidence,
	ConfirmationResourceRep,
	MetricDistributions,
	ConfirmationResourceReport,
	ConfirmationCommandTotal,
	MutableMetricDistributions,
};
