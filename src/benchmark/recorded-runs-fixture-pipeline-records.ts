import { mkdir } from "node:fs/promises";

import { INITIAL_CHECKPOINT_STAGE, parseCheckpointRecord } from "./checkpoint";
import type { HashedFile } from "./checkpoint";
import type { ClaudeCallMetrics, Immutable } from "./contracts";
import { writeRunManifest } from "./manifest";
import { runSummarySchema } from "./record-summary";
import type { RunSummaryRecord } from "./record-summary";
import type {
	RecordedRunsContext,
	RecordedRunsFixtureProps,
} from "./recorded-runs-fixture-context";
import PipelineRecordData from "./recorded-runs-fixture-pipeline-data";
import {
	CASE_ID,
	FINAL_JUDGE_FAILURE,
	FIRST_FIXTURE_STAGE_INDEX,
	ORDINAL_BASE,
	RECORDED_READINGS,
} from "./recorded-runs-fixture-readings";
import { mergeIntoRecord, serialize } from "./recorded-runs-fixture-record-io";
import { benchmarkRunPaths, checkpointRecordFile } from "./run-layout";

interface RecordedRunArtifactProps {
	readonly timestamp: string;
	readonly status: string;
	readonly caseId?: string;
}

interface WritePipelineRunRequest {
	readonly run: string;
	readonly caseId: string;
	readonly settingsFile?: HashedFile | undefined;
}

class PipelineRecords {
	private readonly context: RecordedRunsContext;
	public constructor(props: RecordedRunsFixtureProps) {
		this.context = props.context;
	}

	public readonly writePipelineRun = async ({
		run,
		caseId,
		settingsFile,
	}: WritePipelineRunRequest): Promise<void> => {
		const recordedSettings = settingsFile ?? this.context.settingsFile;
		const paths = benchmarkRunPaths(this.context.runsDirectory, run);

		await mkdir(paths.checkpointsDirectory, { recursive: true });

		await writeRunManifest(
			paths.manifestFile,
			PipelineRecordData.manifest({
				caseId,
				sourceRoot: this.context.sourceRoot,
				timestamp: run,
			}),
		);

		await Array.fromAsync(this.context.stages, async (stage) => {
			const directory = paths.checkpointDirectory(stage);

			await mkdir(directory, { recursive: true });

			const recordFile = checkpointRecordFile(directory);
			const record = PipelineRecordData.checkpoint(stage, recordedSettings);

			await Bun.write(recordFile, serialize(record));
		});

		await Bun.write(
			paths.artifactFile,
			serialize(this.artifact({ caseId, status: "COMPLETE", timestamp: run })),
		);
	};

	public readonly writeFinishedRunEvidence = async (
		run: string,
	): Promise<void> => {
		await this.writePipelineRun({ caseId: CASE_ID, run });

		const paths = benchmarkRunPaths(this.context.runsDirectory, run);

		await Array.fromAsync(this.context.stages, async (stage) => {
			await Bun.write(
				paths.stageFile(stage),
				PipelineRecordData.scorecard(stage),
			);
		});
	};

	public readonly writeFailedVerdictRun = async (
		run: string,
	): Promise<void> => {
		await this.writePipelineRun({ caseId: CASE_ID, run });
		await Bun.write(
			benchmarkRunPaths(this.context.runsDirectory, run).artifactFile,
			serialize(this.artifact({ status: "FAILED", timestamp: run })),
		);
	};

	public readonly writeFinalJudgeFailedRun = async (
		run: string,
		judgeProviderCalls?: readonly {
			readonly metrics?: Immutable<ClaudeCallMetrics>;
		}[],
	): Promise<void> => {
		await this.writePipelineRun({ caseId: CASE_ID, run });

		const { grade: _grade, ...graded } = this.artifact({
			status: "FAILED",
			timestamp: run,
		});

		await Bun.write(
			benchmarkRunPaths(this.context.runsDirectory, run).artifactFile,
			serialize({
				...graded,
				failure: FINAL_JUDGE_FAILURE,
				judgeProviderCalls,
			}),
		);
	};

	public readonly writeInitialCheckpoint = async (
		run = this.context.replayableRun,
		settingsFile?: HashedFile,
	): Promise<void> => {
		const paths = benchmarkRunPaths(this.context.runsDirectory, run);
		const directory = paths.checkpointDirectory(INITIAL_CHECKPOINT_STAGE);

		await mkdir(directory, { recursive: true });

		await Bun.write(
			checkpointRecordFile(directory),
			serialize(
				PipelineRecordData.initialCheckpoint(
					settingsFile ?? this.context.settingsFile,
				),
			),
		);
	};

	public readonly recordSettingsFile = async (
		settingsFile?: HashedFile,
		run = this.context.replayableRun,
	): Promise<void> => {
		const paths = benchmarkRunPaths(this.context.runsDirectory, run);
		await Array.fromAsync(
			[INITIAL_CHECKPOINT_STAGE, ...this.context.stages],
			async (stage) => {
				const file = Bun.file(
					checkpointRecordFile(paths.checkpointDirectory(stage)),
				);
				if (!(await file.exists())) {
					return;
				}

				const record = parseCheckpointRecord(await file.text());

				await Bun.write(file, serialize({ ...record, settingsFile }));
			},
		);
	};

	public readonly writeFinishedRunWithReadings = async (
		run: string,
		productOwner: "asked" | "never asked" = "asked",
	): Promise<void> => {
		await this.writeFinishedRunEvidence(run);

		const paths = benchmarkRunPaths(this.context.runsDirectory, run);

		await writeRunManifest(paths.manifestFile, {
			...PipelineRecordData.manifest({
				sourceRoot: this.context.sourceRoot,
				timestamp: run,
			}),
			minimumGrade: RECORDED_READINGS.minimumGrade,
		});

		await Array.fromAsync(
			Object.entries(RECORDED_READINGS.stageElapsedMs),
			async ([stage, elapsedMs]) => {
				await mergeIntoRecord(paths.stageFile(stage), { elapsedMs });
			},
		);

		await mergeIntoRecord(paths.artifactFile, {
			elapsedMs: RECORDED_READINGS.runElapsedMs,
			productOwnerProviderCalls:
				productOwner === "asked"
					? [{ metrics: RECORDED_READINGS.productOwnerMetrics }]
					: [],
		});
	};

	public readonly gradeBuildBelowRaisedMinimum = async (
		run: string,
	): Promise<void> => {
		const paths = benchmarkRunPaths(this.context.runsDirectory, run);

		await mergeIntoRecord(paths.manifestFile, { minimumGrade: "A" });

		await mergeIntoRecord(paths.stageFile("build"), {
			grade: { grade: "B", verdict: "CONTINUE" },
		});
	};

	public readonly writeEmptyCheckpointDirectory = async (
		stage: string,
	): Promise<void> => {
		const paths = benchmarkRunPaths(
			this.context.runsDirectory,
			this.context.replayableRun,
		);
		await mkdir(paths.checkpointDirectory(stage), { recursive: true });
	};

	public readonly writeEmptyRunDirectory = async (
		run: string,
	): Promise<void> => {
		await mkdir(
			benchmarkRunPaths(this.context.runsDirectory, run).checkpointsDirectory,
			{
				recursive: true,
			},
		);
	};

	public readonly writeReplayableRun = async (): Promise<void> => {
		await this.writePipelineRun({
			caseId: CASE_ID,
			run: this.context.replayableRun,
		});
	};

	public readonly writeUnreplayableRun = async (): Promise<void> => {
		const paths = benchmarkRunPaths(
			this.context.runsDirectory,
			this.context.unreplayableRun,
		);

		await mkdir(paths.checkpointsDirectory, { recursive: true });

		await Bun.write(
			paths.artifactFile,
			serialize(
				this.artifact({
					status: "FAILED",
					timestamp: this.context.unreplayableRun,
				}),
			),
		);
	};

	public readonly artifact = ({
		timestamp,
		status,
		caseId = CASE_ID,
	}: RecordedRunArtifactProps): RunSummaryRecord =>
		runSummarySchema.parse({
			caseId,
			grade: {
				requirements: [],
				summary: "the final judge's summary",
				verdict: status === "COMPLETE" ? "PASS" : "FAIL",
			},
			judgeCostUsd: 1.5,
			productOwnerCostUsd: 0.25,
			stageScorecards: this.context.stages.map((stage, index) => ({
				costUsd: index + ORDINAL_BASE,
				grade: {
					dimensions: [],
					grade: index === FIRST_FIXTURE_STAGE_INDEX ? "A" : "B",
					verdict: "CONTINUE",
				},
				stage,
			})),
			status,
			timestamp,
			workflow: this.context.stages.map((stage, index) => ({
				costUsd: index + ORDINAL_BASE,
				stage,
			})),
		});
}

export { PipelineRecords as default };
