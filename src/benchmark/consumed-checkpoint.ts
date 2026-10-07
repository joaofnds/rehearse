/**
 * The checkpoint recorded at run start, before any stage runs, so the first
 * stage replays from a checkpoint like every other stage. The name is
 * reserved in pipeline definitions; a stage of the same name would claim the
 * same checkpoint directory. This module has no imports, so the client
 * imports it directly instead of re-deriving which checkpoint a replay needs.
 */
export const INITIAL_CHECKPOINT_STAGE = "initial";

/** The checkpoint a replay of the stage at `index` in pipeline order starts from. */
export function consumedCheckpointStage(
	stages: readonly string[],
	index: number,
): string {
	return stages[index - 1] ?? INITIAL_CHECKPOINT_STAGE;
}
