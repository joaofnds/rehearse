import type { SessionConfirmationRepRecord } from "./confirmation-record";
import { sessionConfirmationRepRecordSchema } from "./confirmation-record";
import type { SessionAttempt } from "./session-attempt";
import type { SessionConfirmationRequest } from "./session-confirmation-contract";
import type { FrozenSessionInputs } from "./session-confirmation-frozen-inputs";
import sessionProviderMetrics from "./session-provider-metrics";
import { sessionQualityReading } from "./session-quality-reading";

interface SessionRepContext {
	readonly request: SessionConfirmationRequest;
	readonly inputs: FrozenSessionInputs;
	readonly plan: { readonly ordinal: number; readonly repId: string };
}

interface SessionRepResult {
	readonly attempt: SessionAttempt;
	readonly error: string | undefined;
	readonly elapsedMs: number;
}

function repRecord(
	{ request, inputs, plan }: SessionRepContext,
	{ attempt, error, elapsedMs }: SessionRepResult,
): SessionConfirmationRepRecord {
	const metrics = sessionProviderMetrics(attempt);
	const stage = checksStage({ attempt, elapsedMs, error });

	return sessionConfirmationRepRecordSchema.parse({
		caseId: request.sessionCase.declaration.id,
		elapsedMs,
		finalOutcome: { status: "NOT_APPLICABLE" },
		groupId: request.groupId,
		lineage: { kind: "SESSION", lineage: inputs.lineage },
		...metrics,
		judge: sessionQualityReading(attempt.judge),
		mode: "session",
		ordinal: plan.ordinal,
		outcome:
			attempt.outcome === "SUCCESSFUL" && metrics.metrics.status === "COMPLETE"
				? "SUCCESSFUL"
				: "UNSUCCESSFUL",
		repId: plan.repId,
		schemaVersion: 2,
		stages: [stage],
	});
}

function checksStage({
	attempt,
	error,
	elapsedMs,
}: SessionRepResult): SessionConfirmationRepRecord["stages"][number] {
	const evidence = { recordFile: "attempt.json" };
	if (attempt.outcome === "EXECUTION_FAILED") {
		return {
			elapsedMs,
			error: error ?? "Session invocation failed",
			evidence,
			stage: "checks",
			status: "EXECUTION_FAILED",
		};
	} else if (attempt.outcome === "NO_REPLY") {
		return {
			evidence,
			reason: "The session produced no reply",
			stage: "checks",
			status: "NOT_REACHED",
		};
	} else if (attempt.metrics === undefined) {
		return {
			elapsedMs,
			error: "Worker call metrics are missing",
			evidence,
			stage: "checks",
			status: "METRICS_MISSING",
		};
	}
	const passed = attempt.outcome === "SUCCESSFUL";

	return passed
		? {
				elapsedMs,
				evidence,
				grade: "A",
				stage: "checks",
				status: "JUDGED",
				verdict: "CONTINUE",
			}
		: {
				elapsedMs,
				evidence,
				grade: "F",
				stage: "checks",
				status: "JUDGED",
				verdict: "STOP",
			};
}
export { repRecord as default };
