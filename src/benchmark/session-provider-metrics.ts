import type { SessionConfirmationRepRecord } from "./confirmation-record";
import type { ClaudeCallMetrics } from "./contracts";
import type { SessionJudgeRecord } from "./session-judge-contract";

const NO_WORKER_TURNS = 0;
const EMPTY_COLLECTION_LENGTH = 0;

interface SessionMetricInput {
	readonly metrics?: ClaudeCallMetrics | undefined;
	readonly judge?: SessionJudgeRecord | undefined;
}

function sessionProviderMetrics(
	attempt: SessionMetricInput,
): Pick<SessionConfirmationRepRecord, "metrics" | "workerTrajectorySteps"> {
	const calls: SessionConfirmationRepRecord["metrics"]["calls"] = [];
	const missing: string[] = [];
	if (attempt.metrics === undefined) {
		missing.push("worker call metrics");
	} else {
		calls.push({ metrics: attempt.metrics, role: "worker" });
	}
	for (const call of attempt.judge?.providerCalls ?? []) {
		if (call.metrics === undefined) {
			missing.push("final-judge call metrics");
		} else {
			calls.push({ metrics: call.metrics, role: "final-judge" });
		}
	}

	return {
		metrics:
			missing.length === EMPTY_COLLECTION_LENGTH
				? { calls, status: "COMPLETE" }
				: { calls, missing, status: "MISSING" },
		workerTrajectorySteps: attempt.metrics?.turns ?? NO_WORKER_TURNS,
	};
}

export { sessionProviderMetrics as default };
