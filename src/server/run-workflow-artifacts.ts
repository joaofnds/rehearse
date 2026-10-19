import type { CheckpointRecord } from "#benchmark/checkpoint";
import type {
	ArtifactIn,
	ArtifactsIn,
	ArtifactsOut,
	CheckpointsByLineage,
	MissingPart,
	ShortIdReading,
	WorkflowStateChange,
} from "#server/run-record-contract";

function workflowStateChanges(
	checkpoint: CheckpointRecord | undefined,
	checkpoints: CheckpointsByLineage,
): ArtifactsOut["workflowState"] {
	if (checkpoint === undefined) {
		return {
			reasons: ["the stage saved no checkpoint to compare"],
			state: "unavailable",
		};
	}

	const upstream = checkpoints.get(checkpoint.upstream);
	if (upstream === undefined) {
		return {
			reasons: ["the run holds no checkpoint the stage continued from"],
			state: "unavailable",
		};
	}

	const before = new Map(
		upstream.workflowState.map(({ path, sha256 }) => [path, sha256]),
	);
	const after = new Map(
		checkpoint.workflowState.map(({ path, sha256 }) => [path, sha256]),
	);
	const changes = workflowChanges(before, after);

	return { changes, state: "available" };
}

function workflowChanges(
	before: ReadonlyMap<string, string>,
	after: ReadonlyMap<string, string>,
): WorkflowStateChange[] {
	const changes: WorkflowStateChange[] = [];
	for (const [path, sha256] of after) {
		const earlier = before.get(path);
		if (earlier === undefined) {
			changes.push({ change: "added", path });
		} else if (earlier !== sha256) {
			changes.push({ change: "modified", path });
		}
	}
	changes.push(...removedWorkflowFiles(before, after));

	return changes;
}

function removedWorkflowFiles(
	before: ReadonlyMap<string, string>,
	after: ReadonlyMap<string, string>,
): WorkflowStateChange[] {
	const changes: WorkflowStateChange[] = [];
	for (const path of before.keys()) {
		if (!after.has(path)) {
			changes.push({ change: "removed", path });
		}
	}

	return changes;
}

/** Where a stage's session started: the target at the checkpoint before it. */
interface Upstream {
	readonly target: string;
	readonly upstream: string;
	readonly checkpointShortId: ShortIdReading;
}

/** The part of an earlier stage's record its later stages start from. */
interface EarlierStage {
	readonly stage: string;
	readonly artifactsOut: Pick<ArtifactsOut, "workflowState">;
}

/**
 * What a stage's session started from: the task card the case names, the
 * target at the checkpoint before it, and each workflow-state file an earlier
 * stage changed, named by the latest stage that changed it. A file an earlier
 * stage removed is not there to start from.
 */

class EarlierArtifacts {
	readonly #latest = new Map<string, ArtifactIn>();
	readonly #missing: MissingPart[] = [];

	public add({ stage, artifactsOut }: EarlierStage): void {
		const { workflowState } = artifactsOut;
		if (workflowState.state === "unavailable") {
			this.#missing.push({
				part: stage,
				reason: workflowState.reasons.join("; "),
			});
		} else {
			for (const { path, change } of workflowState.changes) {
				this.#latest.delete(path);
				if (change !== "removed") {
					this.#latest.set(path, {
						change,
						from: "earlier stage",
						path,
						stage,
					});
				}
			}
		}
	}

	public reading(taskId: string, upstream: Upstream): ArtifactsIn {
		return {
			entries: [
				{ from: "task declaration", taskId },
				{ from: "upstream checkpoint", ...upstream },
				...this.#latest.values(),
			],
			missing: this.#missing,
		};
	}
}

function artifactsIn(
	taskId: string,
	upstream: Upstream,
	earlier: readonly EarlierStage[],
): ArtifactsIn {
	const artifacts = new EarlierArtifacts();
	for (const stage of earlier) {
		artifacts.add(stage);
	}

	return artifacts.reading(taskId, upstream);
}

export { workflowStateChanges, artifactsIn };
export type { Upstream, EarlierStage };
