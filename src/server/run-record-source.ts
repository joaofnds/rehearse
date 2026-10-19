import { INITIAL_CHECKPOINT_STAGE } from "#benchmark/checkpoint";
import type { CheckpointRecord } from "#benchmark/checkpoint";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { loadRunManifest } from "#benchmark/manifest";
import type { RunManifest } from "#benchmark/manifest";
import { recordFileExists } from "#benchmark/record-read-scope";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { BenchmarkRunPaths, RunLocation } from "#benchmark/run-layout";
import type {
	CheckpointsByLineage,
	RecordedStage,
	RunWideRecords,
	ShortIdReading,
} from "#server/run-record-contract";
import { readArtifactSpend } from "#server/run-record-totals";
import { readRunShortId } from "#server/run-short-id-reading";
import { readCheckpoint, readStageFile } from "#server/run-stage-file";

async function checkpointReadings(
	paths: RunRecordSource["paths"],
	manifest: RunRecordSource["manifest"],
): Promise<RunCheckpointReadings> {
	const stages: RunRecordSource["stages"][number][] = [];
	await Array.fromAsync(manifest.pipeline.stages, async ({ name }) => {
		const file = await readStageFile(paths, name);
		const checkpoint = await readCheckpoint(paths, name);

		stages.push({
			checkpoint,
			file,
			stage: name,
		});
	});
	const initial = await readCheckpoint(paths, INITIAL_CHECKPOINT_STAGE);
	const checkpoints = new Map(
		[initial, ...stages.map(({ checkpoint }) => checkpoint)]
			.filter((checkpoint) => checkpoint !== undefined)
			.map((checkpoint) => [checkpoint.lineage, checkpoint]),
	);

	return { checkpoints, initial, stages };
}

async function readRunSource({
	runsDirectory,
	run,
}: RunLocation): Promise<RunRecordSource> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	if (!(await recordFileExists(paths.manifestFile))) {
		throw new RefusedPreconditionError(`No pipeline run ${run} is recorded`);
	}

	const manifest = await loadRunManifest(paths.manifestFile);
	const readings = await checkpointReadings(paths, manifest);
	const runWide = {
		artifact: await readArtifactSpend(paths),
		stopRecord: readings.stages.find(
			({ file }) => file?.status === "STAGE_JUDGE_FAILED",
		)?.file,
	};
	const shortId = await readRunShortId(runsDirectory, manifest.caseId, run);

	return { manifest, paths, run, ...readings, runWide, shortId };
}

interface RunCheckpointReadings {
	readonly stages: readonly RecordedStage[];
	readonly initial: CheckpointRecord | undefined;
	readonly checkpoints: CheckpointsByLineage;
}

interface RunRecordSource extends RunCheckpointReadings {
	readonly run: string;
	readonly paths: BenchmarkRunPaths;
	readonly manifest: RunManifest;
	readonly runWide: RunWideRecords;
	readonly shortId: ShortIdReading;
}

export { readRunSource as default };
export type { RunCheckpointReadings, RunRecordSource };
