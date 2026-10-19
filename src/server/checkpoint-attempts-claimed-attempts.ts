import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import { readReplayRecord } from "#benchmark/replay";
import {
	confirmationGroupPaths,
	replayRecordFile,
} from "#benchmark/run-layout";
import type { ShortIdEntry } from "#benchmark/short-id";
import type {
	CheckpointAttempt,
	CheckpointIdentity,
	ClaimedAttempt,
	ClaimedAttempts,
} from "#server/checkpoint-attempts-contract";
import { checkpointKey } from "#server/checkpoint-attempts-ordered-attempts";
import readOptionalRecord from "#server/optional-record";

async function judgedStageReps(
	runsDirectory: string,
	groupId: string,
): Promise<readonly { repId: string; ordinal: number }[]> {
	const paths = confirmationGroupPaths(runsDirectory, groupId);
	const group = await readOptionalRecord(async () =>
		parseConfirmationGroupRecord(await Bun.file(paths.groupFile).text()),
	);
	if (group?.mode !== "stage") {
		return [];
	}

	const judged: { repId: string; ordinal: number }[] = [];
	await Array.fromAsync(group.repRecords, async ({ repId, ordinal }) => {
		const rep = await readOptionalRecord(async () =>
			parseConfirmationRepRecord(
				await Bun.file(paths.rep(repId).recordFile).text(),
			),
		);
		if (rep?.stages.every(({ status }) => status === "JUDGED") === true) {
			judged.push({ ordinal, repId });
		}
	});

	return judged;
}

interface ClaimedReplay extends CheckpointIdentity {
	readonly attempt: Extract<CheckpointAttempt, { readonly kind: "replay" }>;
}

async function claimedReplay(
	runsDirectory: string,
	record: Extract<ShortIdEntry["record"], { readonly kind: "attempt:stage" }>,
): Promise<ClaimedReplay | undefined> {
	const replay = await readOptionalRecord(
		async () =>
			await readReplayRecord(
				replayRecordFile(runsDirectory, record.lineage, record.timestamp),
			),
	);
	return replay === undefined
		? undefined
		: {
				attempt: {
					kind: "replay",
					lineage: record.lineage,
					timestamp: record.timestamp,
				},
				run: replay.runName,
				stage: replay.stage,
			};
}

type CheckpointClaims = Map<
	string,
	{ run: string; stage: string; attempts: ClaimedAttempt[] }
>;

function addClaimedAttempt(
	byCheckpoint: CheckpointClaims,
	{ run, stage }: CheckpointIdentity,
	attempt: ClaimedAttempt,
): void {
	const key = checkpointKey(run, stage);
	const found = byCheckpoint.get(key) ?? { attempts: [], run, stage };
	found.attempts.push(attempt);
	byCheckpoint.set(key, found);
}

/**
 * Each claimed replay and judged rep of a stage-mode group, by the checkpoint
 * it started from. A group claimed before claims recorded their source cannot
 * be placed and is left out.
 */
async function claimedAttempts(
	runsDirectory: string,
	entries: readonly ShortIdEntry[],
): Promise<ClaimedAttempts> {
	const runClaims = new Map<string, number>();
	const byCheckpoint: CheckpointClaims = new Map();

	await Array.fromAsync(entries.entries(), async ([claim, { record }]) => {
		if (record.kind === "run") {
			runClaims.set(record.run, claim);
		}
		if (record.kind === "attempt:stage") {
			const replay = await claimedReplay(runsDirectory, record);
			if (replay !== undefined) {
				addClaimedAttempt(byCheckpoint, replay, {
					attempt: replay.attempt,
					claim,
					ordinal: 0,
				});
			}
		}

		if (record.kind === "group" && record.source !== undefined) {
			const { run, stage } = record.source;
			for (const { repId, ordinal } of await judgedStageReps(
				runsDirectory,
				record.groupId,
			)) {
				addClaimedAttempt(
					byCheckpoint,
					{ run, stage },
					{
						attempt: { groupId: record.groupId, kind: "rep", ordinal, repId },
						claim,
						ordinal,
					},
				);
			}
		}
	});

	return { byCheckpoint, runClaims };
}

export { claimedAttempts as default };
