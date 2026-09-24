import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import { parseRunSummaryRecord } from "#benchmark/record-summary";
import { readReplayRecord } from "#benchmark/replay";
import {
	benchmarkRunPaths,
	checkpointRecordFile,
	confirmationGroupPaths,
	replayRecordFile,
} from "#benchmark/run-layout";
import type { ShortIdEntry } from "#benchmark/short-id";
import { formatRecordId } from "#cli/record-id";

/** Which attempt at its checkpoint a record is: "attempt 2 of 3". */
export interface AttemptPosition {
	readonly position: number;
	readonly count: number;
}

/**
 * One run of a stage from the checkpoint before it, ordered by claim number
 * and, inside a confirmation group, by the rep's position in it. Only a
 * replay has a page that names its attempt, so only a replay keeps its id.
 */
interface Attempt {
	readonly replayId: string | undefined;
	readonly claim: number;
	readonly ordinal: number;
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
 * The original run counts as an attempt at the checkpoint before a stage when
 * it recorded that stage's checkpoint or a grade for it. A stop record carries
 * no grade, so a run stopped at the stage does not count.
 */
async function originalRecorded(
	runsDirectory: string,
	run: string,
	stage: string,
): Promise<boolean> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	if (
		await Bun.file(
			checkpointRecordFile(paths.checkpointDirectory(stage)),
		).exists()
	) {
		return true;
	}
	const artifact = await readable(async () =>
		parseRunSummaryRecord(await Bun.file(paths.artifactFile).text()),
	);

	return (
		artifact?.stageScorecards.some((scorecard) => scorecard.stage === stage) ??
		false
	);
}

async function judgedStageReps(
	runsDirectory: string,
	groupId: string,
): Promise<readonly number[]> {
	const paths = confirmationGroupPaths(runsDirectory, groupId);
	const group = await readable(async () =>
		parseConfirmationGroupRecord(await Bun.file(paths.groupFile).text()),
	);
	if (group?.mode !== "stage") {
		return [];
	}

	const judged: number[] = [];
	for (const { repId, ordinal } of group.repRecords) {
		const rep = await readable(async () =>
			parseConfirmationRepRecord(
				await Bun.file(paths.rep(repId).recordFile).text(),
			),
		);
		if (rep?.stages.every(({ status }) => status === "JUDGED") === true) {
			judged.push(ordinal);
		}
	}

	return judged;
}

/**
 * Each claimed replay's attempt at the checkpoint it started from, by its
 * Record ID. The count takes every attempt there that recorded a result: the
 * original run's stage, replays, and judged reps of stage-mode groups whose
 * claim names the run and stage. A group claimed before claims recorded their
 * source cannot be placed and is left out.
 */
export async function replayAttempts(
	runsDirectory: string,
	entries: readonly ShortIdEntry[],
): Promise<ReadonlyMap<string, AttemptPosition>> {
	const runClaims = new Map<string, number>();
	const byCheckpoint = new Map<
		string,
		{ run: string; stage: string; attempts: Attempt[] }
	>();
	const add = (run: string, stage: string, attempt: Attempt): void => {
		const key = JSON.stringify([run, stage]);
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
					replayId: formatRecordId(record),
					claim,
					ordinal: 0,
				});
			}
		}
		if (record.kind === "group" && record.source !== undefined) {
			const { run, stage } = record.source;
			for (const ordinal of await judgedStageReps(
				runsDirectory,
				record.groupId,
			)) {
				add(run, stage, { replayId: undefined, claim, ordinal });
			}
		}
	}

	const positions = new Map<string, AttemptPosition>();
	for (const { run, stage, attempts } of byCheckpoint.values()) {
		const counted = (await originalRecorded(runsDirectory, run, stage))
			? [
					...attempts,
					{ replayId: undefined, claim: runClaims.get(run) ?? -1, ordinal: 0 },
				]
			: attempts;
		const ordered = counted.toSorted(
			(left, right) => left.claim - right.claim || left.ordinal - right.ordinal,
		);
		for (const [index, { replayId }] of ordered.entries()) {
			if (replayId !== undefined) {
				positions.set(replayId, {
					position: index + 1,
					count: ordered.length,
				});
			}
		}
	}

	return positions;
}
