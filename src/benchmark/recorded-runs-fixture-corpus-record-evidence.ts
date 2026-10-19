import {
	captureStageCorpus,
	parseCheckpointRecord,
	stageCorpusRoots,
} from "./checkpoint";
import type { CheckpointRecord, HashedFile } from "./checkpoint";
import { resolveCorpusFile } from "./corpus-file";
import type { CorpusRoot } from "./corpus-file";
import type { CorpusMeasurement } from "./corpus-measurement";
import { measureCorpusVersion } from "./corpus-version";
import type { ReadManifestEntry } from "./read-manifest";
import type { RecordedRunsContext } from "./recorded-runs-fixture-context";
import type PipelineRecords from "./recorded-runs-fixture-pipeline-records";
import { mergeIntoRecord, serialize } from "./recorded-runs-fixture-record-io";
import { replayRecordSchema } from "./replay";
import { benchmarkRunPaths, checkpointRecordFile } from "./run-layout";

interface CorpusRecordEvidenceProps {
	readonly context: RecordedRunsContext;
	readonly pipelineRecords: PipelineRecords;
}

class CorpusRecordEvidence {
	private readonly context: RecordedRunsContext;
	private readonly pipelineRecords: PipelineRecords;
	public constructor(props: CorpusRecordEvidenceProps) {
		this.context = props.context;
		this.pipelineRecords = props.pipelineRecords;
	}

	public readonly recordCorpusFrom = async (
		source: CorpusRoot,
		run = this.context.replayableRun,
	): Promise<void> => {
		const paths = benchmarkRunPaths(this.context.runsDirectory, run);
		const instructions = await Bun.file(
			resolveCorpusFile(source, "CLAUDE.md"),
		).text();
		const roots = stageCorpusRoots(source, this.context.sourceRoot);

		await Array.fromAsync(this.context.stages, async (stage) => {
			const corpusFiles = await captureStageCorpus(stage, instructions, roots);
			const directory = paths.checkpointDirectory(stage);
			const record = parseCheckpointRecord(
				await Bun.file(checkpointRecordFile(directory)).text(),
			);

			await Bun.write(
				checkpointRecordFile(directory),
				serialize({ ...record, corpusFiles }),
			);
		});
	};

	public readonly recordReadManifest = async (
		stage: string,
		readManifest: readonly ReadManifestEntry[],
		run = this.context.replayableRun,
	): Promise<void> => {
		const file = checkpointRecordFile(
			benchmarkRunPaths(this.context.runsDirectory, run).checkpointDirectory(
				stage,
			),
		);
		const record = parseCheckpointRecord(await Bun.file(file).text());

		await Bun.write(file, serialize({ ...record, readManifest }));
	};

	public readonly recordStageReadManifest = async (
		stage: string,
		readManifest: readonly ReadManifestEntry[],
		corpusFiles: readonly HashedFile[] = [],
	): Promise<void> => {
		await mergeIntoRecord(
			benchmarkRunPaths(
				this.context.runsDirectory,
				this.context.stoppedRun,
			).stageFile(stage),
			{ corpusFiles, readManifest },
		);
	};

	public readonly recordStoppedStageFrom = async (
		source: CorpusRoot,
	): Promise<void> => {
		await this.pipelineRecords.writeInitialCheckpoint(this.context.stoppedRun);

		const instructions = await Bun.file(
			resolveCorpusFile(source, "CLAUDE.md"),
		).text();

		await mergeIntoRecord(
			benchmarkRunPaths(
				this.context.runsDirectory,
				this.context.stoppedRun,
			).stageFile("build"),
			{
				corpusFiles: await captureStageCorpus(
					"build",
					instructions,
					stageCorpusRoots(source, this.context.sourceRoot),
				),
				corpusVersion: await measureCorpusVersion(
					this.context.runsDirectory,
					source,
				),
				model: "sonnet",
			},
		);
	};

	public readonly recordReplayReadManifest = async (
		readManifest: readonly ReadManifestEntry[],
	): Promise<void> => {
		const record = replayRecordSchema.parse(
			JSON.parse(await Bun.file(this.context.stageAttemptFile).text()),
		);
		await Bun.write(
			this.context.stageAttemptFile,
			serialize({ ...record, readManifest }),
		);
	};

	public readonly recordReplayFrom = async (
		source: CorpusRoot,
	): Promise<void> => {
		const instructions = await Bun.file(
			resolveCorpusFile(source, "CLAUDE.md"),
		).text();
		const record = replayRecordSchema.parse(
			JSON.parse(await Bun.file(this.context.stageAttemptFile).text()),
		);
		const corpusFiles = await captureStageCorpus(
			record.stage,
			instructions,
			stageCorpusRoots(source, this.context.sourceRoot),
		);
		const corpusVersion = await measureCorpusVersion(
			this.context.runsDirectory,
			source,
		);

		await Bun.write(
			this.context.stageAttemptFile,
			serialize({ ...record, corpusFiles, corpusVersion }),
		);
	};

	public readonly recordVersionFrom = async (
		source: CorpusRoot,
		run = this.context.replayableRun,
	): Promise<CorpusMeasurement> => {
		const corpusVersion = await measureCorpusVersion(
			this.context.runsDirectory,
			source,
		);
		const paths = benchmarkRunPaths(this.context.runsDirectory, run);

		await Array.fromAsync(this.context.stages, async (stage) => {
			const directory = paths.checkpointDirectory(stage);
			const record = parseCheckpointRecord(
				await Bun.file(checkpointRecordFile(directory)).text(),
			);

			await Bun.write(
				checkpointRecordFile(directory),
				serialize({ ...record, corpusVersion }),
			);
		});

		return corpusVersion;
	};

	public readonly rewriteDiscussCheckpoint = async (
		change: Partial<
			Pick<CheckpointRecord, "artifacts" | "workflowState" | "readManifest">
		>,
	): Promise<void> => {
		const file = checkpointRecordFile(
			benchmarkRunPaths(
				this.context.runsDirectory,
				this.context.stoppedRun,
			).checkpointDirectory("discuss"),
		);
		const recorded = parseCheckpointRecord(await Bun.file(file).text());

		await Bun.write(file, serialize({ ...recorded, ...change }));
	};
}

export { CorpusRecordEvidence as default };
