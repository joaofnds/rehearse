import type { SessionConfirmationRepRecord } from "./confirmation-record";
import { sessionConfirmationRepRecordSchema } from "./confirmation-record";
import type { SessionAttempt } from "./session-attempt";
import type { SessionConfirmationRequest } from "./session-confirmation-contract";
import type { FrozenSessionInputs } from "./session-confirmation-frozen-inputs";

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

const NO_WORKER_TURNS = 0;

function repRecord(
	{ request, inputs, plan }: SessionRepContext,
	{ attempt, error, elapsedMs }: SessionRepResult,
): SessionConfirmationRepRecord {
	const metrics =
		attempt.metrics === undefined
			? {
					calls: [],
					missing: ["worker call metrics"],
					status: "MISSING" as const,
				}
			: {
					calls: [{ metrics: attempt.metrics, role: "worker" as const }],
					status: "COMPLETE" as const,
				};
	const stage = checksStage({ attempt, elapsedMs, error });

	return sessionConfirmationRepRecordSchema.parse({
		caseId: request.sessionCase.declaration.id,
		elapsedMs,
		finalOutcome: { status: "NOT_APPLICABLE" },
		groupId: request.groupId,
		lineage: { kind: "SESSION", lineage: inputs.lineage },
		metrics,
		mode: "session",
		ordinal: plan.ordinal,
		outcome:
			attempt.outcome === "SUCCESSFUL" && attempt.metrics !== undefined
				? "SUCCESSFUL"
				: "UNSUCCESSFUL",
		repId: plan.repId,
		schemaVersion: 2,
		stages: [stage],
		workerTrajectorySteps: attempt.metrics?.turns ?? NO_WORKER_TURNS,
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
