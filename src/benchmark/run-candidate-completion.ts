import type { JudgedRunCandidate } from "./run-candidate-judgment";
import type { PreparedRunExecution } from "./run-execution-context";
import type RunReview from "./run-review";
import { finishGradedRun } from "./run-review-completion";

interface RunCandidateCompletionRequest extends PreparedRunExecution {
	readonly candidate: JudgedRunCandidate;
	readonly review: Readonly<RunReview>;
}
async function completeRunCandidate({
	execution,
	prepared,
	candidate,
	review,
}: RunCandidateCompletionRequest): Promise<void> {
	const { artifact, evidence } = candidate;
	const { inputs, source, identity, lifetime, output } = execution;
	await finishGradedRun(
		{
			artifact,
			calibrationInput: {
				finalCandidate: {
					baselineContext: prepared.target.baseline.baselineContext,
					changedPaths: evidence.changedPaths,
					checkIntegrity: evidence.checkIntegrity,
					diff: evidence.diff,
					localChecks: evidence.localChecks,
					originalGrade: artifact.grade,
				},
				finalRubricPath: inputs.benchmarkCase.finalRubricPath,
				originalInstructions: prepared.evidence.corpus.instructions,
				originalRubric: prepared.evidence.task.rubric,
				rubricsDirectory: inputs.benchmarkCase.rubricsDirectory,
				stageScorecards: artifact.stageScorecards,
			},
			pause: inputs.config.pause,
			resultSha: evidence.resultSha,
			runName: identity.files.name,
			targetDir: source.root,
		},
		{
			awaitArtifactReview: lifetime.abort.awaitArtifactReview,
			collectCalibration: review.collectCalibration,
			collectJudgeAgreement: async (calibration) =>
				await review.collectFinalAgreement(artifact, calibration),
			completeArtifact: lifetime.abort.completeArtifact,
			log: output.log,
			recordRetentionRef: prepared.evidence.retainCommit,
		},
	);
}
export { completeRunCandidate as default };
