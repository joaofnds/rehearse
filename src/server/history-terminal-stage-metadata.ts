import type { SessionHistoryReportMetadata } from "#benchmark/session-history";
import { redactAbsolutePaths } from "#server/redact-path";

interface StageRecordIdentityFields {
	readonly caseId: string;
	readonly run: string;
	readonly stage: string;
	readonly model: string;
	readonly corpusFiles: readonly {
		readonly path: string;
		readonly sha256: string;
	}[];
}

/**
 * The stop's reason is whatever the harness wrote, the only record-derived
 * sentence this report carries, so it is redacted here rather than at the
 * error path that covers every other one.
 */
function stoppedStageMetadata(
	fields: Readonly<StageRecordIdentityFields>,
	error: string,
): Pick<SessionHistoryReportMetadata, "attempt" | "unavailableReason"> {
	return {
		attempt: {
			kind: "stopped-stage",
			...fields,
			error: redactAbsolutePaths(error),
		},
		unavailableReason: "stage-stopped",
	};
}

function awaitingJudgeStageMetadata(
	fields: Readonly<StageRecordIdentityFields>,
): Pick<SessionHistoryReportMetadata, "attempt" | "unavailableReason"> {
	return {
		attempt: { kind: "awaiting-judge-stage", ...fields },
		unavailableReason: "stage-judging-never-completed",
	};
}

export { stoppedStageMetadata, awaitingJudgeStageMetadata };
