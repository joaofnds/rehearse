import {
	assertPlanningStageCompleted,
	readTaskCard,
	readTaskOutput,
} from "./backlog";
import { captureStageCorpus, resolveSkillDirectory } from "./checkpoint";
import { captureCheckIntegrity } from "./checks";
import type { StageOutcome } from "./run-stage-contract";
import RunStageCorpusEvidence from "./run-stage-corpus-evidence";
import executeRunStageSequence from "./run-stage-sequence";
import type { RunStageSequenceRequest } from "./run-stage-sequence";
import { runStageJudge } from "./stage-grading";
import { stageSessionsWithServices } from "./stage-session";
import {
	assertBuildCommitted,
	captureBuildCandidate,
	changedPathsBetween,
	snapshotCheckout,
} from "./target";
import { runWorkflowStage } from "./workflow";

async function executePreparedRunStages(
	request: RunStageSequenceRequest,
): Promise<StageOutcome> {
	const evidence = new RunStageCorpusEvidence(request);
	return await executeRunStageSequence(
		stageSessionsWithServices(
			{
				assertBuildCommitted,
				assertPlanningStageCompleted,
				captureBuildCandidate,
				captureCheckIntegrity,
				captureStageCorpus,
				captureTreatmentChecks: evidence.captureTreatmentChecks,
				changedPathsBetween,
				corpusVersionFiles: evidence.corpusVersionFiles,
				measureCorpus: evidence.measureCorpus,
				readTaskCard,
				readTaskOutput,
				recordCheckpoint: request.prepared.evidence.recordCheckpoint,
				resolveSkillDirectory,
				runStageJudge,
				runWorkflowStage,
				snapshotCheckout,
			},
			request.prepared.target.environment,
		),
		request,
	);
}
export { executePreparedRunStages as default };
