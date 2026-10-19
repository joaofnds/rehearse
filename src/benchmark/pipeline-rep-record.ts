import type { ConfirmationRepRecord } from "./confirmation-record";
import { confirmationRepRecordSchema } from "./confirmation-record";
import type { Immutable } from "./contracts";
import type { PipelineConfirmationRequest } from "./pipeline-confirmation-request";
import type { PipelineRepPlan } from "./pipeline-rep-execution";

interface PipelineRepRecordInputs {
	readonly request: PipelineConfirmationRequest;
	readonly plan: PipelineRepPlan;
	readonly elapsedMs: number;
	readonly finalOutcome: ConfirmationRepRecord["finalOutcome"];
	readonly stages: Immutable<ConfirmationRepRecord["stages"]>;
	readonly evidence: Immutable<
		Pick<ConfirmationRepRecord, "metrics" | "workerTrajectorySteps">
	>;
	readonly successful: boolean;
}
function pipelineRepRecord({
	request,
	plan,
	elapsedMs,
	finalOutcome,
	stages,
	evidence,
	successful,
}: PipelineRepRecordInputs): ConfirmationRepRecord {
	return confirmationRepRecordSchema.parse({
		caseId: request.caseId,
		elapsedMs,
		finalOutcome,
		groupId: request.groupId,
		lineage: { kind: "SOURCE", sha: request.source.sha },
		metrics: evidence.metrics,
		mode: "pipeline",
		ordinal: plan.ordinal,
		outcome: successful ? "SUCCESSFUL" : "UNSUCCESSFUL",
		repId: plan.repId,
		schemaVersion: 1,
		stages,
		workerTrajectorySteps: evidence.workerTrajectorySteps,
		worktreePath: plan.worktreePath,
	});
}
export { pipelineRepRecord as default };
