import type { GradedRunArtifact } from "./contracts";
import type { RunArtifactBaseInputs } from "./run-artifact";
import type { PreparedRunExecution } from "./run-execution-context";
import captureFinalRunEvidence from "./run-final-evidence";
import { judgeRun } from "./run-final-judgment";
import type { StageOutcome } from "./run-stage-contract";

const RECORD_JSON_INDENT_SPACES = 2;
interface JudgedRunCandidate {
	readonly artifact: GradedRunArtifact;
	readonly evidence: RunArtifactBaseInputs["evidence"];
}
async function judgeRunCandidate(
	request: PreparedRunExecution,
	outcome: StageOutcome,
): Promise<JudgedRunCandidate> {
	const artifactInputs = await captureFinalRunEvidence(request, outcome);
	const { output, lifetime, identity, inputs, spendCeiling } =
		request.execution;
	output.writeProgress("\nJudge session");
	const artifact = await judgeRun({
		artifactInputs,
		elapsedMs: lifetime.elapsedMs,
		reviewFile: identity.files.reviewFile,
		spendCeiling,
		writeFailedArtifact: lifetime.abort.writeFailedArtifact,
	});
	output.writeProgress(
		JSON.stringify(artifact.grade, null, RECORD_JSON_INDENT_SPACES),
	);
	await lifetime.abort.writePendingArtifact(artifact);
	output.writeProgress(`Run artifact: ${identity.files.artifactFile}`);
	if (inputs.config.pause) {
		output.writeProgress(`Human review: ${identity.files.reviewFile}`);
	}
	return { artifact, evidence: artifactInputs.evidence };
}
export { judgeRunCandidate as default };
export type { JudgedRunCandidate };
