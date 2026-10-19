import { recordCheckpoint } from "./checkpoint";
import { recordRetentionRef } from "./target";
import { retainInTarget } from "./target-clone";

/**
 * Records the checkpoint and then pins its commit under refs/rehearse, in
 * that order: an unpinned checkpoint is a gc race, a stray ref without a
 * checkpoint is only debris.
 */
function retainedCheckpointRecorder(
	runName: string,
	retain: typeof recordRetentionRef,
): typeof recordCheckpoint {
	return async (targetDir, directory, inputs) => {
		const record = await recordCheckpoint(targetDir, directory, inputs);
		await retain(targetDir, runName, inputs.targetSha);

		return record;
	};
}

/**
 * Pins the commit in the run's checkout and copies the pin into the target at
 * once, so the target holds every commit the run retained even when the run
 * is killed before it can remove its checkout.
 */
function retentionInTarget(targetRoot: string): typeof recordRetentionRef {
	return async (checkout, runName, sha) => {
		await recordRetentionRef(checkout, runName, sha);
		await retainInTarget(checkout, targetRoot, runName);
	};
}

export { retainedCheckpointRecorder, retentionInTarget };
