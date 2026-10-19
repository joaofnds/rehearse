import type { HashedFile, RootLineageInputs } from "./checkpoint-lineage";
import { rootLineage } from "./checkpoint-lineage";
import type { CheckpointInputs } from "./checkpoint-record";
import type { Effort } from "./config";

const PREVIOUS_ELEMENT_OFFSET = 1;

/**
 * The checkpoint recorded at run start, before any stage runs, so the first
 * stage replays from a checkpoint like every other stage. The name is
 * reserved in pipeline definitions; a stage of the same name would claim the
 * same checkpoint directory.
 */
const INITIAL_CHECKPOINT_STAGE = "initial";

/** The checkpoint a replay of the stage at `index` in pipeline order starts from. */
function consumedCheckpointStage(
	stages: readonly string[],
	index: number,
): string {
	return stages[index - PREVIOUS_ELEMENT_OFFSET] ?? INITIAL_CHECKPOINT_STAGE;
}

interface CheckpointSettings {
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly settingsFile?: HashedFile | undefined;
}

/**
 * The initial checkpoint consumes no corpus: no skill ran to produce it. Its
 * upstream is the root lineage, so the chain starts at the initial state the
 * run created rather than at any stage's output.
 */
function initialCheckpointInputs(
	root: RootLineageInputs,
	{ model, effort, settingsFile }: CheckpointSettings,
): CheckpointInputs {
	return {
		artifacts: [],
		corpusFiles: [],
		effort,
		model,
		settingsFile,
		stage: INITIAL_CHECKPOINT_STAGE,
		targetSha: root.taskSha,
		upstream: rootLineage(root),
	};
}
export {
	INITIAL_CHECKPOINT_STAGE,
	consumedCheckpointStage,
	initialCheckpointInputs,
};
