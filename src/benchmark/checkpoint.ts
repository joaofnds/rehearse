import { canonicalFiles, lineageKey } from "./checkpoint-lineage";
import type { CheckpointInputs, CheckpointRecord } from "./checkpoint-record";
import { checkpointPaths, hashWorkflowState } from "./checkpoint-storage";
import { preserveStageTranscript } from "./stage-transcript-evidence";
import { copyWorkflowState } from "./workflow-state";

const RECORD_JSON_INDENT_SPACES = 2;

async function recordCheckpoint(
	targetDir: string,
	directory: string,
	inputs: CheckpointInputs,
): Promise<CheckpointRecord> {
	const workflowState = await hashWorkflowState(targetDir);
	const locations = checkpointPaths(directory);

	await copyWorkflowState(targetDir, locations.snapshot);

	const record: CheckpointRecord = {
		artifacts: canonicalFiles(inputs.artifacts),
		corpusFiles: canonicalFiles(inputs.corpusFiles),
		corpusVersion: inputs.corpusVersion,
		effort: inputs.effort,
		lineage: lineageKey(inputs),
		model: inputs.model,
		readManifest: inputs.readManifest,
		settingsFile: inputs.settingsFile,
		stage: inputs.stage,
		targetSha: inputs.targetSha,
		transcript: await preserveStageTranscript(
			targetDir,
			directory,
			inputs.transcript,
		),
		upstream: inputs.upstream,
		workflowState: canonicalFiles(workflowState),
	};

	await Bun.write(
		locations.record,
		`${JSON.stringify(record, null, RECORD_JSON_INDENT_SPACES)}\n`,
	);

	return record;
}

export { recordCheckpoint };
export {
	canonicalFiles,
	lineageKey,
	hashFile,
	rootLineage,
	hashArtifacts,
	hashedFileSchema,
} from "./checkpoint-lineage";
export type {
	HashedFile,
	LineageInputs,
	RootLineageInputs,
} from "./checkpoint-lineage";
export { hashDirectory, walkDirectory } from "./directory-tree-walk";
export type { WalkedDirectory } from "./directory-tree-walk";
export {
	corpusLayoutRoots,
	stageCorpusRoots,
	resolveSkillDirectory,
	GLOBAL_SKILLS,
} from "./stage-corpus-directories";
export {
	captureStageCorpus,
	captureStageCorpusWithoutSkill,
	snapshotStageCorpus,
	snapshotStageCorpusWithoutSkill,
} from "./stage-corpus-snapshot";
export { default as installStageCorpusSnapshot } from "./stage-corpus-install";
export {
	hashedCorpus,
	refusedCorpus,
	corpusDifferences,
	stageCorpusChanges,
} from "./corpus-file-changes";
export type {
	StageCorpus,
	CorpusDifferenceWording,
	ChangedCorpusFile,
} from "./corpus-file-changes";
export {
	loadedBeyondCaptured,
	readCorpusFiles,
	withLoadedFilesNow,
} from "./recorded-corpus-files";
export type { RecordedReads } from "./recorded-corpus-files";
export {
	readChangedFilesOnly,
	modelCause,
	effortCause,
	deriveStaleness,
} from "./checkpoint-staleness";
export type {
	StalenessRequest,
	CheckpointStaleness,
	StalenessLink,
} from "./checkpoint-staleness";
export { default as parseCheckpointRecord } from "./checkpoint-record";
export type { CheckpointRecord, CheckpointInputs } from "./checkpoint-record";
export {
	TRANSCRIPT_FILE,
	stageTranscriptFile,
	preserveStageTranscript,
} from "./stage-transcript-evidence";
export type {
	StageTranscriptSource,
	StageTranscriptEvidence,
} from "./stage-transcript-evidence";
export {
	hashWorkflowState,
	readCheckpointRecord,
	materializeCheckpoint,
} from "./checkpoint-storage";
export {
	INITIAL_CHECKPOINT_STAGE,
	consumedCheckpointStage,
	initialCheckpointInputs,
} from "./initial-checkpoint";
