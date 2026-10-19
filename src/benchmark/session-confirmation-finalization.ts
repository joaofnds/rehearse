import { join } from "node:path";

import { finalizeConfirmationGroup } from "./confirmation-evidence";
import type {
	ConfirmationGroupFinalization,
	ConfirmationGroupOutcome,
} from "./confirmation-group-finalization-contract";
import type { SessionConfirmationContext } from "./session-confirmation-execution";

async function finalizeSessionGroup(
	{ request, inputs, paths, now }: SessionConfirmationContext,
	repResults: ConfirmationGroupFinalization["repResults"],
	{
		startedAt,
		makespanStart,
	}: { readonly startedAt: string; readonly makespanStart: number },
): Promise<ConfirmationGroupOutcome> {
	return await finalizeConfirmationGroup({
		approvalMethod: request.approvalMethod,
		caseId: request.sessionCase.declaration.id,
		declaredStages: ["checks"],
		groupDirectory: paths.directory,
		groupFile: paths.groupFile,
		groupId: request.groupId,
		inputs: {
			corpusVersion: inputs.corpusVersion,
			effort: request.effort,
			files: inputs.files,
			lineage: { kind: "SESSION", lineage: inputs.lineage },
			model: request.model,
			sessionBudgetUsd: request.sessionBudgetUsd,
			spendCeilingUsd: request.spendCeilingUsd,
		},
		makespanMs: now() - makespanStart,
		mode: "session",
		operatorStopFile: paths.operatorStopFile,
		preflight:
			request.preflight.status === "COMPLETE"
				? {
						call: { metrics: request.preflight.call.metrics, role: "worker" },
						status: "COMPLETE",
					}
				: request.preflight,
		projectedCost: request.projectedCost,
		repResults,
		reportFile: paths.reportFile,
		reps: request.reps,
		runsDirectory: request.runsDirectory,
		startedAt,
		worktreesDirectory: join(paths.directory, "worktrees"),
	});
}
export { finalizeSessionGroup as default };
