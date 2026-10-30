import type {
	CheckpointRecord,
	HashedFile,
	StageCorpusDelivery,
} from "./checkpoint";
import type { FrozenFile } from "./confirmation-evidence";
import type { ContextFile } from "./contracts";
import type { CorpusMeasurement } from "./corpus-measurement";
import type { HomePathCitationMap } from "./home-path-citation";
import type { StageDefinition } from "./pipeline";
import type { PipelineConfirmationDependencies } from "./pipeline-confirmation-dependencies";
import type { PipelineConfirmationRequest } from "./pipeline-confirmation-request";

interface FrozenPipelineStage {
	readonly definition: StageDefinition;
	readonly directory: string;
	readonly files: readonly HashedFile[];
	readonly corpusDelivery: StageCorpusDelivery;
}

interface FrozenPipelineInputs {
	/** The live install's citation map every stage install of the run delivers against. */
	readonly citations: HomePathCitationMap;
	readonly taskId: string;
	readonly taskSha: string;
	readonly initialCheckpoint: CheckpointRecord;
	readonly checkpointDirectory: string;
	readonly baselineContext: readonly ContextFile[];
	readonly baselineHashes: ReadonlyMap<string, string>;
	readonly stages: readonly FrozenPipelineStage[];
	readonly corpusVersion: CorpusMeasurement;
	readonly versionFiles: readonly HashedFile[];
	readonly files: readonly FrozenFile[];
}

interface PipelineInputDirectories {
	readonly groupDirectory: string;
	readonly inputsDirectory: string;
	readonly worktreesDirectory: string;
}
interface PipelineInputExecution {
	readonly dependencies: PipelineConfirmationDependencies;
	readonly request: PipelineConfirmationRequest;
	readonly directories: PipelineInputDirectories;
}
export type {
	FrozenPipelineInputs,
	FrozenPipelineStage,
	PipelineInputDirectories,
	PipelineInputExecution,
};
