import type { SessionConfirmationRepRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";

const CONFIRMATION_SCHEMA_VERSION = 2;

class SessionConfirmationRepBuilder {
	readonly #values: Immutable<Partial<SessionConfirmationRepRecord>>;
	public constructor(
		values: Immutable<Partial<SessionConfirmationRepRecord>> = {},
	) {
		this.#values = values;
	}
	public build(): Immutable<SessionConfirmationRepRecord> {
		const workerMetrics = {
			cacheReadTokens: 30,
			cacheWriteTokens: 40,
			costUsd: 0.5,
			inputTokens: 100,
			outputTokens: 20,
			turns: 3,
		};

		return {
			caseId: "smoke",
			elapsedMs: 10,
			finalOutcome: { status: "NOT_APPLICABLE" as const },
			groupId: "session-group",
			lineage: { kind: "SESSION" as const, lineage: "lineage-1" },
			metrics: {
				calls: [{ metrics: workerMetrics, role: "worker" as const }],
				status: "COMPLETE" as const,
			},
			mode: "session" as const,
			ordinal: 1,
			outcome: "SUCCESSFUL" as const,
			repId: "session-group-rep-1",
			schemaVersion: CONFIRMATION_SCHEMA_VERSION,
			stages: [
				{
					elapsedMs: 10,
					evidence: { recordFile: "attempt.json" },
					grade: "A" as const,
					stage: "checks" as const,
					status: "JUDGED" as const,
					verdict: "CONTINUE" as const,
				},
			],
			workerTrajectorySteps: 3,
			...this.#values,
		};
	}
}
export { SessionConfirmationRepBuilder as default };
