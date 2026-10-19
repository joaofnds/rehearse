import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { CheckpointRecord } from "./checkpoint";
import { INITIAL_CHECKPOINT_STAGE, readCheckpointRecord } from "./checkpoint";
import type { RunManifest } from "./manifest";
import { loadRunManifest } from "./manifest";
import ReplayError from "./replay-contract";
import type { ReplayPlan, ReplayRequest } from "./replay-contract";
import type { ReplayDependencies } from "./replay-dependencies";
import type { ShortId } from "./short-id";
import { claimShortId } from "./short-id";

const PREFIX_START_INDEX = 0;
/**
 * Every checkpoint the run recorded, keyed by stage. The record's own stage
 * name is authoritative; the directory name only locates it.
 */
async function loadRunCheckpoints(
	runDirectory: string,
): Promise<Map<string, CheckpointRecord>> {
	const checkpoints = new Map<string, CheckpointRecord>();

	await Array.fromAsync(
		await readdir(runDirectory, { withFileTypes: true }),
		async (entry) => {
			if (!entry.isDirectory()) {
				return;
			}

			const record = await readCheckpointRecord(join(runDirectory, entry.name));
			checkpoints.set(record.stage, record);
		},
	);

	return checkpoints;
}
function replayLineage(
	checkpoints: ReadonlyMap<string, CheckpointRecord>,
	stages: readonly { readonly name: string }[],
): Omit<ReplayPlan, "definition"> {
	const initial = checkpoints.get(INITIAL_CHECKPOINT_STAGE);
	if (!initial) {
		throw new ReplayError(
			"The run has no initial checkpoint; runs recorded before initial checkpoints cannot be replayed",
		);
	}

	let consumed = initial;
	const earlierCheckpoints = stages.map((earlier) => {
		const checkpoint = checkpoints.get(earlier.name);
		if (!checkpoint) {
			throw new ReplayError(
				`The run has no checkpoint for the ${earlier.name} stage; it stopped before accepting it`,
			);
		}

		if (checkpoint.upstream !== consumed.lineage) {
			throw new ReplayError(
				`The run's checkpoint chain is broken at the ${earlier.name} stage: it consumed ${checkpoint.upstream}, but ${consumed.stage} produced ${consumed.lineage}`,
			);
		}

		consumed = checkpoint;

		return checkpoint;
	});

	return {
		chain: [initial, ...earlierCheckpoints],
		consumed,
		priorArtifacts: earlierCheckpoints.flatMap(({ artifacts }) => artifacts),
	};
}
/**
 * Replaying stage N consumes the checkpoint of stage N-1: the state after
 * that stage was accepted. The whole chain back to the initial checkpoint is
 * verified first, because the prior artifacts fed to the judge are collected
 * from every earlier checkpoint and a broken link would present artifacts
 * that never led to the consumed state.
 */
function resolveReplay(
	manifest: RunManifest,
	checkpoints: ReadonlyMap<string, CheckpointRecord>,
	stageName: string,
): ReplayPlan {
	const { stages } = manifest.pipeline;
	const index = stages.findIndex(({ name }) => name === stageName);
	const definition = stages[index];
	if (!definition) {
		throw new ReplayError(
			`The run's pipeline has no ${stageName} stage; it declares ${stages
				.map(({ name }) => name)
				.join(", ")}`,
		);
	}

	const { chain, consumed, priorArtifacts } = replayLineage(
		checkpoints,
		stages.slice(PREFIX_START_INDEX, index),
	);

	return { chain, consumed, definition, priorArtifacts };
}
interface ReplayInputs {
	readonly manifest: RunManifest;
	readonly plan: ReplayPlan;
	readonly sourceRoot: string;
	readonly shortId: ShortId;
}
async function loadReplayInputs(
	dependencies: ReplayDependencies,
	request: ReplayRequest,
): Promise<ReplayInputs> {
	const manifest = await loadRunManifest(request.paths.manifestFile);
	const checkpoints = await loadRunCheckpoints(
		request.paths.checkpointsDirectory,
	);
	const plan = resolveReplay(manifest, checkpoints, request.stage);
	const sourceRoot = await dependencies.replaySourceRoot(
		{
			checkout: manifest.sourceRoot,
			declared: request.declaredTargetRoot,
			target: manifest.targetRoot,
		},
		plan.consumed.targetSha,
	);
	const shortId = await claimShortId(
		request.paths.runsDirectory,
		manifest.caseId,
		{ kind: "replay", run: request.paths.name, stage: request.stage },
	);

	return { manifest, plan, shortId, sourceRoot };
}
export { loadRunCheckpoints, resolveReplay, loadReplayInputs };
export type { ReplayInputs };
