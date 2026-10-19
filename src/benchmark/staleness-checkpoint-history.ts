import type { CheckpointRecord } from "./checkpoint";
import { INITIAL_CHECKPOINT_STAGE, parseCheckpointRecord } from "./checkpoint";
import { loadRunManifest } from "./manifest";
import type { RunManifest } from "./manifest";
import { benchmarkRunPaths, checkpointRecordFile } from "./run-layout";
import type { RunLocation } from "./run-layout";
import judgeCheckpointHistory from "./staleness-checkpoint-comparison";
import type {
	CurrentSessionKnobs,
	RecordStaleness,
	UnreadableStaleRecord,
} from "./staleness-contract";
import type { CorpusJudgedAgainst } from "./staleness-current-corpus";
import { stoppedStageLink } from "./staleness-stopped-stage";
import type { JudgedLink } from "./staleness-stopped-stage";

async function checkpointChain(
	runsDirectory: string,
	run: string,
	stages: readonly string[],
): Promise<readonly CheckpointRecord[]> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	const chain: CheckpointRecord[] = [];

	await Array.fromAsync(stages, async (stage) => {
		const file = Bun.file(
			checkpointRecordFile(paths.checkpointDirectory(stage)),
		);
		if (await file.exists()) {
			chain.push(parseCheckpointRecord(await file.text()));
		}
	});

	return chain;
}

/**
 * A run's judged records, with its stopped stage named unreadable when a
 * stage file or the reads its stop record keeps do not parse, so that stage
 * is reported rather than read as clean and the run's checkpoints are still
 * judged.
 */
interface RunStaleness {
	readonly records: RecordStaleness[];
	readonly unreadableStop: UnreadableStaleRecord | undefined;
}

async function runCheckpointStaleness(
	location: RunLocation,
	against: CorpusJudgedAgainst,
	knobs: CurrentSessionKnobs,
): Promise<RunStaleness | undefined> {
	const { run, runsDirectory } = location;
	const paths = benchmarkRunPaths(runsDirectory, run);
	const manifestFile = Bun.file(paths.manifestFile);
	if (!(await manifestFile.exists())) {
		return undefined;
	}
	const manifest = await loadRunManifest(paths.manifestFile);
	const checkpoints = await checkpointChain(runsDirectory, run, [
		INITIAL_CHECKPOINT_STAGE,
		...manifest.pipeline.stages.map(({ name }) => name),
	]);
	const checkpointsWithStop = await stoppedCheckpointChain(
		location,
		manifest,
		checkpoints,
	);
	const records = await judgeCheckpointHistory(
		{ checkpoints: checkpointsWithStop, location, manifest },
		against,
		knobs,
	);
	return { records, unreadableStop: checkpointsWithStop.unreadableStop };
}

interface StoppedCheckpointChain {
	readonly chain: readonly JudgedLink[];
	readonly stopped: JudgedLink | undefined;
	readonly unreadableStop: UnreadableStaleRecord | undefined;
}

async function stoppedCheckpointChain(
	location: RunLocation,
	manifest: RunManifest,
	checkpoints: readonly CheckpointRecord[],
): Promise<StoppedCheckpointChain> {
	const { run, runsDirectory } = location;
	let unreadableStop: UnreadableStaleRecord | undefined = undefined;
	let stopped: JudgedLink | undefined = undefined;
	try {
		stopped = await stoppedStageLink(
			{ run, runsDirectory },
			manifest,
			checkpoints,
		);
	} catch (error) {
		unreadableStop = {
			id: `run:${run}`,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
	const chain: readonly JudgedLink[] =
		stopped === undefined ? checkpoints : [...checkpoints, stopped];
	return { chain, stopped, unreadableStop };
}

interface RecordedRunHistory {
	readonly location: RunLocation;
	readonly manifest: RunManifest;
	readonly checkpoints: StoppedCheckpointChain;
}

export { stopRecordReadsSchema } from "./staleness-stopped-stage";

export { runCheckpointStaleness };

export type { RecordedRunHistory, RunStaleness };
