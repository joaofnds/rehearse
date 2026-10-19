import { hashArtifacts } from "./checkpoint";
import type { PipelineStageExecution } from "./pipeline-rep-state";
import type { ReadManifestEntry } from "./read-manifest";
import type { StageSessionResult } from "./stage-session-contract";

interface PipelineCheckpointEvidence {
	readonly session: StageSessionResult;
	readonly readManifest: readonly ReadManifestEntry[];
}
async function checkpointPipelineRep(
	{ scope, evidence, inspection }: PipelineStageExecution,
	{ session, readManifest }: PipelineCheckpointEvidence,
): Promise<void> {
	const { request, frozen, plan } = scope.context;
	const { definition } = inspection;

	evidence.advance(session);

	const checkpoint = await scope.dependencies.recordCheckpoint(
		plan.worktreePath,
		scope.repPaths.checkpointDirectory(definition.name),
		{
			artifacts: hashArtifacts(session.artifact ? [session.artifact] : []),
			corpusFiles: inspection.files,
			corpusVersion: frozen.corpusVersion,
			effort: request.effort,
			model: request.model,
			readManifest,
			settingsFile: request.loadedSettings?.hashed,
			stage: definition.name,
			targetSha: session.resultSha,
			upstream: evidence.upstream,
		},
	);

	evidence.checkpointRecorded(checkpoint.lineage);
}
export { checkpointPipelineRep as default };
