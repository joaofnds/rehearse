import {
	INITIAL_CHECKPOINT_STAGE,
	readCheckpointRecord,
	readCorpusFiles,
} from "./checkpoint";
import { loadRunManifest } from "./manifest";
import { readReplayRecord } from "./replay-record";
import {
	benchmarkRunPaths,
	checkpointRecorded,
	replayRecordFile,
} from "./run-layout";

/**
 * The stage replay that would show what an edit changed: a stage that read
 * the edited file, replayed from the checkpoint it consumed, or why none can.
 */
export type PairedRerun =
	| { readonly kind: "offered"; readonly run: string; readonly stage: string }
	| { readonly kind: "none"; readonly reason: string };

interface Candidate {
	/** The run name or replay timestamp, which order rows by when they ran. */
	readonly ranAt: string;
	readonly run: string;
	readonly stage: string;
}

function readPath(
	record: Parameters<typeof readCorpusFiles>[0],
	path: string,
): boolean {
	return readCorpusFiles(record).some((file) => file.path === path);
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
	const stages = manifest.pipeline.stages.map(({ name }) => name);
	for (const [index, stage] of stages.entries()) {
		if (!(await checkpointRecorded(paths, stage))) {
			continue;
		}
		const record = await readCheckpointRecord(paths.checkpointDirectory(stage));
		if (readPath(record, path)) {
			const consumed = stages[index - 1] ?? INITIAL_CHECKPOINT_STAGE;

			return (await checkpointRecorded(paths, consumed))
				? { ranAt: run, run, stage }
				: undefined;
		}
	}

	return undefined;
}

async function replayCandidate(
	runsDirectory: string,
	lineage: string,
	timestamp: string,
	path: string,
): Promise<Candidate | undefined> {
	const record = await readReplayRecord(
		replayRecordFile(runsDirectory, lineage, timestamp),
	);
	if (!readPath(record, path)) {
		return undefined;
	}
	const paths = benchmarkRunPaths(runsDirectory, record.runName);

	return (await checkpointRecorded(paths, record.consumed.stage))
		? { ranAt: timestamp, run: record.runName, stage: record.stage }
		: undefined;
}

function candidateOf(
	runsDirectory: string,
	row: string,
	path: string,
): Promise<Candidate | undefined> {
	if (row.startsWith("run:")) {
		return runCandidate(runsDirectory, row.slice("run:".length), path);
	}
	if (row.startsWith("attempt:stage:")) {
		const id = row.slice("attempt:stage:".length);
		const split = id.lastIndexOf("/");

		return replayCandidate(
			runsDirectory,
			id.slice(0, split),
			id.slice(split + 1),
			path,
		);
	}

	return Promise.resolve(undefined);
}

/**
 * The stage of the newest invalidated run or stage replay that read the
 * edited file. Session attempts and confirmation groups replay no single
 * stage, so they offer none. A row whose records cannot be read offers none
 * rather than failing an edit already written.
 */
export async function pairedRerun(
	runsDirectory: string,
	invalidated: readonly string[],
	path: string,
): Promise<PairedRerun> {
	const candidates = await Promise.all(
		invalidated.map((row) =>
			candidateOf(runsDirectory, row, path).catch(() => undefined),
		),
	);
	const [newest] = candidates
		.filter((candidate) => candidate !== undefined)
		.toSorted((left, right) => (left.ranAt < right.ranAt ? 1 : -1));

	return newest === undefined
		? {
				kind: "none",
				reason: `No result this edit marked stale holds a recorded checkpoint to replay a stage that read ${path} from`,
			}
		: { kind: "offered", run: newest.run, stage: newest.stage };
}
