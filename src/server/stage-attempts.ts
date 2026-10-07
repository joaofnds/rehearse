import type { CorpusRoot } from "#benchmark/corpus-file";
import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import { INITIAL_CHECKPOINT_STAGE } from "#benchmark/checkpoint";
import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import { unhandled } from "#benchmark/contracts";
import { readReplayRecord } from "#benchmark/replay";
import {
	benchmarkRunPaths,
	checkpointRecorded,
	confirmationGroupPaths,
	replayRecordFile,
} from "#benchmark/run-layout";
import { readAllShortIds } from "#benchmark/short-id";
import { formatRecordId } from "#cli/record-id";
import { checkpointShortId, shortIdsOf } from "#cli/short-id-column";
import type { CheckpointAttempt } from "./checkpoint-attempts";
import { attemptsAtCheckpoint } from "./checkpoint-attempts";
import type { RowStaleness, Staleness } from "./run-history";
import { recordStaleness } from "./run-history";
import { verifiedStageOfRun } from "./stage-record";

/**
 * The original run's stage. Its grade and corpus version are the run
 * record's, which the page already holds, so only its staleness is read here.
 */
interface OriginalAttempt {
	readonly kind: "original";
	readonly id: string;
	readonly staleness: RowStaleness;
}

/** A replay or a judged rep of a stage-mode group, with what it recorded. */
interface RecordedAttempt {
	readonly kind: "replay" | "rep";
	readonly id: string;
	readonly grade: string | undefined;
	readonly corpusVersion: CorpusMeasurement | undefined;
	readonly staleness: RowStaleness;
}

export type StageAttempt = OriginalAttempt | RecordedAttempt;

/**
 * Every attempt at the checkpoint a run's stage started from (SPEC.md 4a),
 * the checkpoint named by its short id where its run claimed one and by its
 * Record ID otherwise.
 */
export interface StageAttempts {
	readonly checkpoint: string;
	readonly attempts: readonly StageAttempt[];
}

interface Lookup {
	readonly runsDirectory: string;
	readonly run: string;
	readonly stage: string;
	readonly shortIds: ReadonlyMap<string, string>;
	readonly staleness: Staleness;
}

function claimedId(lookup: Lookup, recordId: string): string {
	return lookup.shortIds.get(recordId) ?? recordId;
}

/**
 * A stage that saved a checkpoint is judged there. One that stopped the run
 * saved none, and its judgment stands under the run's own id.
 */
async function originalAttempt(lookup: Lookup): Promise<OriginalAttempt> {
	const { runsDirectory, run, stage, staleness } = lookup;
	const checkpoint = formatRecordId({ kind: "checkpoint", run, stage });

	return {
		kind: "original",
		id: claimedId(lookup, formatRecordId({ kind: "run", run })),
		staleness: (await checkpointRecorded(
			benchmarkRunPaths(runsDirectory, run),
			stage,
		))
			? staleness.of(checkpoint)
			: staleness.ofRun(run, checkpoint),
	};
}

async function replayAttempt(
	lookup: Lookup,
	lineage: string,
	timestamp: string,
): Promise<RecordedAttempt> {
	const record = await readReplayRecord(
		replayRecordFile(lookup.runsDirectory, lineage, timestamp),
	);
	const recordId = formatRecordId({
		kind: "attempt:stage",
		lineage,
		timestamp,
	});

	return {
		kind: "replay",
		id: claimedId(lookup, recordId),
		grade: record.scorecard.grade.grade,
		corpusVersion: record.corpusVersion,
		staleness: lookup.staleness.of(recordId),
	};
}

/** A rep is judged as part of its group, so its corpus and staleness are the group's. */
async function repAttempt(
	lookup: Lookup,
	groupId: string,
	repId: string,
): Promise<RecordedAttempt> {
	const paths = confirmationGroupPaths(lookup.runsDirectory, groupId);
	const group = parseConfirmationGroupRecord(
		await Bun.file(paths.groupFile).text(),
	);
	const rep = parseConfirmationRepRecord(
		await Bun.file(paths.rep(repId).recordFile).text(),
	);
	const judged = rep.stages.find(({ stage }) => stage === lookup.stage);

	return {
		kind: "rep",
		id: repId,
		grade: judged?.status === "JUDGED" ? judged.grade : undefined,
		corpusVersion: group.inputs.corpusVersion,
		staleness: lookup.staleness.of(formatRecordId({ kind: "group", groupId })),
	};
}

function attemptOf(
	lookup: Lookup,
	attempt: CheckpointAttempt,
): Promise<StageAttempt> {
	switch (attempt.kind) {
		case "original": {
			return originalAttempt(lookup);
		}
		case "replay": {
			return replayAttempt(lookup, attempt.lineage, attempt.timestamp);
		}
		case "rep": {
			return repAttempt(lookup, attempt.groupId, attempt.repId);
		}
		default: {
			return unhandled(attempt, "checkpoint attempt");
		}
	}
}

export async function readStageAttempts(request: {
	readonly runsDirectory: string;
	readonly run: string;
	readonly stage: string;
	readonly source: CorpusRoot;
}): Promise<StageAttempts> {
	const { runsDirectory, source } = request;
	const { manifest, run, stage } = await verifiedStageOfRun(request);
	const stages = manifest.pipeline.stages.map(({ name }) => name);
	const startedFrom =
		stages[stages.indexOf(stage) - 1] ?? INITIAL_CHECKPOINT_STAGE;
	const { entries } = await readAllShortIds(runsDirectory);
	const shortIds = shortIdsOf(entries);
	const lookup: Lookup = {
		runsDirectory,
		run,
		stage,
		shortIds,
		staleness: await recordStaleness(runsDirectory, source),
	};
	const attempts: StageAttempt[] = [];
	for (const attempt of await attemptsAtCheckpoint(
		runsDirectory,
		entries,
		run,
		stage,
	)) {
		attempts.push(await attemptOf(lookup, attempt));
	}

	return {
		checkpoint:
			(await checkpointShortId(runsDirectory, shortIds, run, startedFrom)) ??
			formatRecordId({ kind: "checkpoint", run, stage: startedFrom }),
		attempts,
	};
}
