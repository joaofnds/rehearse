import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import { unhandled } from "#benchmark/contracts";
import { parseRunSummaryRecord } from "#benchmark/record-summary";
import { stoppedStageRecordSchema } from "#benchmark/run-outcome";
import { readReplayRecord } from "#benchmark/replay";
import {
	benchmarkRunPaths,
	checkpointRecorded,
	confirmationGroupPaths,
	replayRecordFile,
} from "#benchmark/run-layout";
import type { ShortIdEntry } from "#benchmark/short-id";
import { formatRecordId } from "#cli/record-id";
import { z } from "zod";

/** Which attempt at its checkpoint a record is: "attempt 2 of 3". */
export interface AttemptPosition {
	readonly position: number;
	readonly count: number;
}

/** Which record an attempt at a checkpoint is. */
export type CheckpointAttempt =
	| { readonly kind: "original" }
	| {
			readonly kind: "replay";
			readonly lineage: string;
			readonly timestamp: string;
	  }
	| {
			readonly kind: "rep";
			readonly groupId: string;
			readonly repId: string;
			readonly ordinal: number;
	  };

/**
 * One run of a stage from the checkpoint before it, ordered by claim number
 * and, inside a confirmation group, by the rep's position in it.
 */
interface ClaimedAttempt {
	readonly attempt: CheckpointAttempt;
	readonly claim: number;
	readonly ordinal: number;
}

/** How a rep is looked up among the attempts, beside replays' Record IDs. */
export function repAttemptId(groupId: string, repId: string): string {
	return `rep:${groupId}/${repId}`;
}

async function readable<Read>(
	read: () => Promise<Read>,
): Promise<Read | undefined> {
	try {
		return await read();
	} catch {
		return undefined;
	}
}

/**
 * A stop record the Judge's findings are written into, because the stage was
 * graded below the pipeline's minimum rather than failing to be judged.
 */
const gradedStopSchema = stoppedStageRecordSchema.extend({
	summary: z.string(),
});

/**
 * The original run counts as an attempt at the checkpoint before a stage when
 * it recorded that stage's checkpoint or a grade for it, a stop for a grade
 * below the minimum included. A run whose judging failed at the stage recorded
 * no result there, so it does not count.
 */
async function originalRecorded(
	runsDirectory: string,
	run: string,
	stage: string,
): Promise<boolean> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	if (await checkpointRecorded(paths, stage)) {
		return true;
	}
	const artifact = await readable(async () =>
		parseRunSummaryRecord(await Bun.file(paths.artifactFile).text()),
	);

	if (
		artifact?.stageScorecards.some((scorecard) => scorecard.stage === stage) ===
		true
	) {
		return true;
	}
	const stopRecord = await readable(async () =>
		gradedStopSchema.parse(
			JSON.parse(await Bun.file(paths.stageFile(stage)).text()),
		),
	);

	return stopRecord !== undefined;
}

async function judgedStageReps(
	runsDirectory: string,
	groupId: string,
): Promise<readonly { repId: string; ordinal: number }[]> {
	const paths = confirmationGroupPaths(runsDirectory, groupId);
	const group = await readable(async () =>
		parseConfirmationGroupRecord(await Bun.file(paths.groupFile).text()),
	);
	if (group?.mode !== "stage") {
		return [];
	}

	const judged: { repId: string; ordinal: number }[] = [];
	for (const { repId, ordinal } of group.repRecords) {
		const rep = await readable(async () =>
			parseConfirmationRepRecord(
				await Bun.file(paths.rep(repId).recordFile).text(),
			),
		);
		if (rep?.stages.every(({ status }) => status === "JUDGED") === true) {
			judged.push({ repId, ordinal });
		}
	}

	return judged;
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

function checkpointKey(run: string, stage: string): string {
	return JSON.stringify([run, stage]);
}

interface ClaimedAttempts {
	readonly runClaims: ReadonlyMap<string, number>;
	readonly byCheckpoint: ReadonlyMap<
		string,
		{
			readonly run: string;
			readonly stage: string;
			readonly attempts: readonly ClaimedAttempt[];
		}
	>;
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
	const byCheckpoint = new Map<
		string,
		{ run: string; stage: string; attempts: ClaimedAttempt[] }
	>();
	const add = (run: string, stage: string, attempt: ClaimedAttempt): void => {
		const key = checkpointKey(run, stage);
		const found = byCheckpoint.get(key) ?? { run, stage, attempts: [] };
		found.attempts.push(attempt);
		byCheckpoint.set(key, found);
	};

	for (const [claim, { record }] of entries.entries()) {
		if (record.kind === "run") {
			runClaims.set(record.run, claim);
		}
		if (record.kind === "attempt:stage") {
			const replay = await readable(() =>
				readReplayRecord(
					replayRecordFile(runsDirectory, record.lineage, record.timestamp),
				),
			);
			if (replay !== undefined) {
				add(replay.runName, replay.stage, {
					attempt: {
						kind: "replay",
						lineage: record.lineage,
						timestamp: record.timestamp,
					},
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
				add(run, stage, {
					attempt: { kind: "rep", groupId: record.groupId, repId, ordinal },
					claim,
					ordinal,
				});
			}
		}
	}

	return { runClaims, byCheckpoint };
}

/**
 * Every attempt at the checkpoint before a stage that recorded a result, in
 * claim order: the original run's stage, when it recorded one, among the
 * replays and judged reps claimed there.
 */
async function orderedAttempts(
	runsDirectory: string,
	claimed: ClaimedAttempts,
	run: string,
	stage: string,
): Promise<readonly CheckpointAttempt[]> {
	const attempts =
		claimed.byCheckpoint.get(checkpointKey(run, stage))?.attempts ?? [];
	const counted = (await originalRecorded(runsDirectory, run, stage))
		? [
				...attempts,
				{
					attempt: { kind: "original" } as const,
					claim: claimed.runClaims.get(run) ?? -1,
					ordinal: 0,
				},
			]
		: attempts;

	return counted
		.toSorted(
			(left, right) => left.claim - right.claim || left.ordinal - right.ordinal,
		)
		.map(({ attempt }) => attempt);
}

/** Every attempt at the checkpoint a run's stage started from, in claim order. */
export async function attemptsAtCheckpoint(
	runsDirectory: string,
	entries: readonly ShortIdEntry[],
	run: string,
	stage: string,
): Promise<readonly CheckpointAttempt[]> {
	return orderedAttempts(
		runsDirectory,
		await claimedAttempts(runsDirectory, entries),
		run,
		stage,
	);
}

/**
 * Each claimed replay's attempt at the checkpoint it started from, by its
 * Record ID, and each judged rep's, by its rep attempt id. The count takes
 * every attempt there that recorded a result: the original run's stage,
 * replays, and judged reps of stage-mode groups whose claim names the run and
 * stage.
 */
export async function checkpointAttempts(
	runsDirectory: string,
	entries: readonly ShortIdEntry[],
): Promise<ReadonlyMap<string, AttemptPosition>> {
	const claimed = await claimedAttempts(runsDirectory, entries);
	const positions = new Map<string, AttemptPosition>();
	for (const { run, stage } of claimed.byCheckpoint.values()) {
		const ordered = await orderedAttempts(runsDirectory, claimed, run, stage);
		for (const [index, attempt] of ordered.entries()) {
			const id = attemptId(attempt);
			if (id !== undefined) {
				positions.set(id, { position: index + 1, count: ordered.length });
			}
		}
	}

	return positions;
}
