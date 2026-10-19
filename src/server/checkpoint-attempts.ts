import { unhandled } from "#benchmark/contracts";
import type { ShortIdEntry } from "#benchmark/short-id";
import { formatRecordId } from "#cli/record-id";
import claimedAttempts from "#server/checkpoint-attempts-claimed-attempts";
import type {
	AttemptPosition,
	CheckpointAttempt,
	CheckpointIdentity,
} from "#server/checkpoint-attempts-contract";
import { orderedAttempts } from "#server/checkpoint-attempts-ordered-attempts";

const ORDINAL_BASE = 1;

/** How a rep is looked up among the attempts, beside replays' Record IDs. */
function repAttemptId(groupId: string, repId: string): string {
	return `rep:${groupId}/${repId}`;
}

/** The id an attempt is looked up by; the original run's stage has none. */
function attemptId(attempt: CheckpointAttempt): string | undefined {
	switch (attempt.kind) {
		case "original": {
			return undefined;
		}
		case "replay": {
			return formatRecordId({
				kind: "attempt:stage",
				lineage: attempt.lineage,
				timestamp: attempt.timestamp,
			});
		}
		case "rep": {
			return repAttemptId(attempt.groupId, attempt.repId);
		}
		default: {
			return unhandled(attempt, "checkpoint attempt");
		}
	}
}

/**
 * Each claimed replay's attempt at the checkpoint it started from, by its
 * Record ID, and each judged rep's, by its rep attempt id. The count takes
 * every attempt there that recorded a result: the original run's stage,
 * replays, and judged reps of stage-mode groups whose claim names the run and
 * stage.
 */
async function checkpointAttempts(
	runsDirectory: string,
	entries: readonly ShortIdEntry[],
): Promise<ReadonlyMap<string, AttemptPosition>> {
	const claimed = await claimedAttempts(runsDirectory, entries);
	const positions = new Map<string, AttemptPosition>();
	await Array.fromAsync(
		claimed.byCheckpoint.values(),
		async ({ run, stage }) => {
			const ordered = await orderedAttempts(runsDirectory, claimed, {
				run,
				stage,
			});
			for (const [index, attempt] of ordered.entries()) {
				const id = attemptId(attempt);
				if (id !== undefined) {
					positions.set(id, {
						count: ordered.length,
						position: index + ORDINAL_BASE,
					});
				}
			}
		},
	);

	return positions;
}

/** Every attempt at the checkpoint a run's stage started from, in claim order. */
async function attemptsAtCheckpoint(
	runsDirectory: string,
	entries: readonly ShortIdEntry[],
	{ run, stage }: CheckpointIdentity,
): Promise<readonly CheckpointAttempt[]> {
	return await orderedAttempts(
		runsDirectory,
		await claimedAttempts(runsDirectory, entries),
		{ run, stage },
	);
}

export { repAttemptId, checkpointAttempts, attemptsAtCheckpoint };

export type {
	AttemptPosition,
	CheckpointAttempt,
} from "#server/checkpoint-attempts-contract";
