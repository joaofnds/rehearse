import {
	consumedCheckpointStage,
	readCheckpointRecord,
	readCorpusFiles,
} from "#benchmark/checkpoint";
import { loadRunManifest } from "#benchmark/manifest";
import { readReplayRecord } from "#benchmark/replay-record";
import type { RunLocation } from "#benchmark/run-layout";
import {
	benchmarkRunPaths,
	checkpointRecorded,
	replayRecordFile,
} from "#benchmark/run-layout";
import { stoppedStage } from "#benchmark/run-outcome";
import serialMap from "#benchmark/serial-map";
import { stopRecordReadsSchema } from "#benchmark/staleness-report";
import { parseRecordId } from "#cli/record-id";

import { redactAbsolutePaths } from "./redact-path";

const SORT_ORDER_AFTER = 1;
const SORT_ORDER_BEFORE = -1;

const EMPTY_COLLECTION_LENGTH = 0;

/**
 * The stage replay that would show what an edit changed: a stage that read
 * the edited file, replayed from the checkpoint it consumed, or why none can.
 */
type PairedRerun =
	| { readonly kind: "offered"; readonly run: string; readonly stage: string }
	| { readonly kind: "none"; readonly reason: string };

interface Candidate {
	/**
	 * The run name or replay timestamp. Both are written by
	 * `runNameFromTimestamp`, so their string order is the order they ran in.
	 */
	readonly ranAt: string;
	readonly run: string;
	readonly stage: string;
}

/**
 * The corpus paths a stage read: its checkpoint's, or, for the stage whose
 * judge stopped the run and so saved no checkpoint, its stop record's.
 */
async function pathsStageRead(
	{ runsDirectory, run }: RunLocation,
	stage: string,
	stopped: string | undefined,
): Promise<readonly string[]> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	if (await checkpointRecorded(paths, stage)) {
		const record = await readCheckpointRecord(paths.checkpointDirectory(stage));

		return readCorpusFiles(record).map((file) => file.path);
	}
	if (stage !== stopped) {
		return [];
	}
	const stageRecordFile = Bun.file(paths.stageFile(stage));
	const reads = stopRecordReadsSchema.parse(
		JSON.parse(await stageRecordFile.text()),
	);

	return (reads.corpusFiles ?? []).map((file) => file.path);
}

/**
 * The first stage in pipeline order that read the file, since every later
 * stage consumed a checkpoint the edit already made stale, and only when the
 * checkpoint it would replay from is recorded.
 */
async function runCandidate(
	runsDirectory: string,
	run: string,
	path: string,
): Promise<Candidate | undefined> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	const manifest = await loadRunManifest(paths.manifestFile);
	const stopped = await stoppedStage(runsDirectory, run);
	const stages = manifest.pipeline.stages.map(({ name }) => name);
	for await (const inspection of serialMap(
		stages.entries(),
		async ([index, stage]) => ({
			index,
			read: await pathsStageRead({ run, runsDirectory }, stage, stopped?.stage),
			stage,
		}),
	)) {
		const { index, stage, read } = inspection;
		if (read.includes(path)) {
			const consumed = consumedCheckpointStage(stages, index);

			return (await checkpointRecorded(paths, consumed))
				? { ranAt: run, run, stage }
				: undefined;
		}
	}

	return undefined;
}
interface ReplayLocation {
	readonly runsDirectory: string;
	readonly lineage: string;
	readonly timestamp: string;
}

async function replayCandidate(
	{ runsDirectory, lineage, timestamp }: ReplayLocation,
	path: string,
): Promise<Candidate | undefined> {
	const record = await readReplayRecord(
		replayRecordFile(runsDirectory, lineage, timestamp),
	);
	if (!readCorpusFiles(record).some((file) => file.path === path)) {
		return undefined;
	}

	const paths = benchmarkRunPaths(runsDirectory, record.runName);

	return (await checkpointRecorded(paths, record.consumed.stage))
		? { ranAt: timestamp, run: record.runName, stage: record.stage }
		: undefined;
}

/** Session attempts and confirmation groups are not offered yet (ACT-441). */
async function candidateOf(
	runsDirectory: string,
	row: string,
	path: string,
): Promise<Candidate | undefined> {
	const id = parseRecordId(row);
	switch (id.kind) {
		case "run": {
			return await runCandidate(runsDirectory, id.run, path);
		}
		case "attempt:stage": {
			return await replayCandidate(
				{ lineage: id.lineage, runsDirectory, timestamp: id.timestamp },
				path,
			);
		}
		case "attempt:session":
		case "case":
		case "checkpoint":
		case "comparison":
		case "group":
		case "rep:session":
		case "rep:stage": {
			return undefined;
		}
		default: {
			return id satisfies never;
		}
	}
}

type RowReading =
	| { readonly kind: "read"; readonly candidate: Candidate | undefined }
	| { readonly kind: "unreadable"; readonly detail: string };

async function readRow(
	runsDirectory: string,
	row: string,
	path: string,
): Promise<RowReading> {
	try {
		return {
			candidate: await candidateOf(runsDirectory, row, path),
			kind: "read",
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return {
			detail: `${row}: ${redactAbsolutePaths(message)}`,
			kind: "unreadable",
		};
	}
}

/**
 * The stage of the newest invalidated run or stage replay that read the
 * edited file. A row whose records cannot be read offers none, rather than
 * failing an edit already written, and the reason names it.
 */
async function pairedRerun(
	runsDirectory: string,
	invalidated: readonly string[],
	path: string,
): Promise<PairedRerun> {
	if (invalidated.length === EMPTY_COLLECTION_LENGTH) {
		return {
			kind: "none",
			reason:
				"The edit marked no recorded result stale, so no replay can show what it changed",
		};
	}

	const readings = await Promise.all(
		invalidated.map(async (row) => await readRow(runsDirectory, row, path)),
	);
	const [newest] = readings
		.flatMap((reading) =>
			reading.kind === "read" && reading.candidate !== undefined
				? [reading.candidate]
				: [],
		)
		.toSorted((left, right) =>
			left.ranAt < right.ranAt ? SORT_ORDER_AFTER : SORT_ORDER_BEFORE,
		);
	if (newest !== undefined) {
		return { kind: "offered", run: newest.run, stage: newest.stage };
	}

	const unreadable = readings.flatMap((reading) =>
		reading.kind === "unreadable" ? [reading.detail] : [],
	);
	const noCheckpoint = `No result this edit marked stale holds a recorded checkpoint to replay a stage that read ${path} from`;

	return {
		kind: "none",
		reason:
			unreadable.length === EMPTY_COLLECTION_LENGTH
				? noCheckpoint
				: `${noCheckpoint}, and these could not be read: ${unreadable.join("; ")}`,
	};
}

export { pairedRerun as default };
export type { PairedRerun };
