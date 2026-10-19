import type { RunArtifactBaseInputs } from "./run-artifact";
import type { PreparedRunExecution } from "./run-execution-context";
import type { StageOutcome } from "./run-stage-contract";
import { captureBuildCandidate } from "./target";

async function captureFinalRunEvidence(
	{ execution, prepared }: PreparedRunExecution,
	outcome: StageOutcome,
): Promise<RunArtifactBaseInputs> {
	const { buildEvidence, workflow, stageScorecards, checkpoints } = outcome;
	if (!buildEvidence) {
		throw new Error("Build stage did not run");
	}
	// The build Judge saw only the delivery stage's own commits; the final
	// Judge grades the whole candidate, planning commits included.
	const fullCandidate = await captureBuildCandidate(
		execution.source.root,
		prepared.evidence.task.taskSha,
	);
	const evidence = {
		...buildEvidence,
		changedPaths: fullCandidate.changedPaths,
		diff: fullCandidate.diff,
	};
	const { corpus, task, initialCheckpoint, productOwner } = prepared.evidence;
	return {
		baselineContext: prepared.target.baseline.baselineContext,
		checkpoints: [initialCheckpoint, ...checkpoints],
		claudeVersion: corpus.claudeVersion,
		config: execution.inputs.config,
		controlSha: execution.identity.controlSha,
		evidence,
		instructions: corpus.instructions,
		pipeline: execution.pipeline,
		productBrief: task.productBrief,
		productOwner: productOwner.snapshot(),
		rubric: task.rubric,
		rubricIds: task.rubricIds,
		source: execution.source,
		stageScorecards,
		task: task.task,
		taskId: task.taskId,
		taskSha: task.taskSha,
		timestamp: execution.identity.timestamp,
		workflow,
	};
}
export { captureFinalRunEvidence as default };
