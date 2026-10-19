import { mkdir } from "node:fs/promises";

import type { ClaudeCallMetrics, Immutable } from "./contracts";
import { writeRunManifest } from "./manifest";
import type {
	RecordedRunsContext,
	RecordedRunsFixtureProps,
} from "./recorded-runs-fixture-context";
import PipelineRecordData from "./recorded-runs-fixture-pipeline-data";
import {
	CEILING_STOPPED_SESSION,
	RECORDED_READINGS,
	STOPPED_RUN_EVIDENCE,
} from "./recorded-runs-fixture-readings";
import { mergeIntoRecord, serialize } from "./recorded-runs-fixture-record-io";
import StoppedStageData from "./recorded-runs-fixture-stopped-stage-data";
import { benchmarkRunPaths, checkpointRecordFile } from "./run-layout";
import type { SessionSpend } from "./stage-session-error";

class StoppedStageRecords {
	private readonly context: RecordedRunsContext;
	public constructor(props: RecordedRunsFixtureProps) {
		this.context = props.context;
	}

	public readonly writeStoppedRun = async (): Promise<void> => {
		const paths = benchmarkRunPaths(
			this.context.runsDirectory,
			this.context.stoppedRun,
		);

		await mkdir(paths.checkpointsDirectory, { recursive: true });

		await writeRunManifest(
			paths.manifestFile,
			PipelineRecordData.manifest({
				sourceRoot: this.context.sourceRoot,
				timestamp: this.context.stoppedRun,
			}),
		);

		await Bun.write(
			paths.stageFile("discuss"),
			StoppedStageData.discussScorecard(),
		);

		await Bun.write(paths.stageFile("build"), StoppedStageData.stoppedStage());
	};

	public readonly writeGradedStoppedRun = async (): Promise<void> => {
		await this.writeStoppedRun();

		const stageFile = benchmarkRunPaths(
			this.context.runsDirectory,
			this.context.stoppedRun,
		).stageFile("build");

		await mergeIntoRecord(stageFile, {
			costUsd: 0.5,
			dimensions: [],
			hardBlockers: [],
			requirements: [],
			summary: "the build misses its requirements",
		});
	};

	public readonly writePreLetterStoppedRun = async (): Promise<void> => {
		await this.writeGradedStoppedRun();
		await mergeIntoRecord(
			benchmarkRunPaths(
				this.context.runsDirectory,
				this.context.stoppedRun,
			).stageFile("build"),
			{
				hardBlockers: [
					{ id: "no-secrets-in-diff", status: "PASS" },
					{ id: "no-unrelated-refactors", status: "FAIL" },
					{ id: "tests-pass-before-handoff", status: "PASS" },
				],
			},
		);
	};

	public readonly writeStoppedRunEvidence = async (
		buildSessionCalls: readonly {
			readonly metrics?: Immutable<ClaudeCallMetrics>;
		}[] = [{ metrics: STOPPED_RUN_EVIDENCE.buildSessionMetrics }],
	): Promise<void> => {
		await this.writeStoppedRun();

		const paths = benchmarkRunPaths(
			this.context.runsDirectory,
			this.context.stoppedRun,
		);

		await Bun.write(
			paths.stageFile("discuss"),
			PipelineRecordData.scorecard("discuss"),
		);

		await Bun.write(
			paths.stageFile("build"),
			StoppedStageData.stoppedEvidence({ buildSessionCalls }),
		);

		await Array.fromAsync(
			PipelineRecordData.workflowCheckpoints(this.context.settingsFile),
			async (record) => {
				const directory = paths.checkpointDirectory(record.stage);

				await mkdir(directory, { recursive: true });

				await Bun.write(checkpointRecordFile(directory), serialize(record));
			},
		);
	};

	public readonly writeSessionCeilingStoppedRun = async (
		session: SessionSpend | null = CEILING_STOPPED_SESSION,
	): Promise<void> => {
		await this.writeStoppedRunEvidence();
		await Bun.write(
			benchmarkRunPaths(
				this.context.runsDirectory,
				this.context.stoppedRun,
			).stageFile("build"),
			StoppedStageData.sessionCeiling({ session }),
		);
	};

	public readonly writeJudgeCeilingStoppedRun = async (
		judgeProviderCalls:
			| readonly {
					readonly metrics?: Immutable<ClaudeCallMetrics>;
			  }[]
			| null = [
			{ metrics: STOPPED_RUN_EVIDENCE.buildJudgeAttemptMetrics },
			{ metrics: STOPPED_RUN_EVIDENCE.buildJudgeHaltedMetrics },
		],
		attempts: readonly object[] = [
			{
				costUsd: 0.4,
				error: "not a scorecard",
				metrics: STOPPED_RUN_EVIDENCE.buildJudgeAttemptMetrics,
				outcome: "REJECTED",
				payload: { not: "a scorecard" },
			},
		],
	): Promise<void> => {
		await this.writeStoppedRunEvidence();
		await Bun.write(
			benchmarkRunPaths(
				this.context.runsDirectory,
				this.context.stoppedRun,
			).stageFile("build"),
			StoppedStageData.judgeCeiling({ attempts, judgeProviderCalls }),
		);
	};

	public readonly writeStoppedRunWithReadings = async (): Promise<void> => {
		await this.writeStoppedRunEvidence();

		const paths = benchmarkRunPaths(
			this.context.runsDirectory,
			this.context.stoppedRun,
		);

		await writeRunManifest(paths.manifestFile, {
			...PipelineRecordData.manifest({
				sourceRoot: this.context.sourceRoot,
				timestamp: this.context.stoppedRun,
			}),
			minimumGrade: RECORDED_READINGS.minimumGrade,
		});

		await mergeIntoRecord(paths.stageFile("discuss"), {
			elapsedMs: RECORDED_READINGS.stageElapsedMs.discuss,
		});

		await mergeIntoRecord(paths.stageFile("build"), {
			attempts: [
				{
					costUsd: 0.5,
					metrics: STOPPED_RUN_EVIDENCE.discussJudgeMetrics,
					outcome: "ACCEPTED",
					payload: {},
				},
			],
			elapsedMs: RECORDED_READINGS.stageElapsedMs.build,
			grade: { grade: RECORDED_READINGS.stoppedLetter, verdict: "STOP" },
			hardBlockers: [
				{ id: "no-secrets-in-diff", status: "FAIL" },
				{ id: "no-unrelated-refactors", status: "FAIL" },
				{ id: "tests-pass-before-handoff", status: "PASS" },
			],
			minimumGrade: RECORDED_READINGS.minimumGrade,
			productOwnerCostUsd: RECORDED_READINGS.productOwnerCostUsd,
			productOwnerProviderCalls: [
				{ metrics: RECORDED_READINGS.productOwnerMetrics },
			],
			runElapsedMs: RECORDED_READINGS.runElapsedMs,
		});
	};

	public readonly writeAwaitingJudgeRun = async (): Promise<void> => {
		const paths = benchmarkRunPaths(
			this.context.runsDirectory,
			this.context.awaitingJudgeRun,
		);

		await mkdir(paths.checkpointsDirectory, { recursive: true });

		await writeRunManifest(
			paths.manifestFile,
			PipelineRecordData.manifest({
				sourceRoot: this.context.sourceRoot,
				timestamp: this.context.awaitingJudgeRun,
			}),
		);

		await Bun.write(
			paths.stageFile("discuss"),
			StoppedStageData.discussScorecard(),
		);

		await this.writeAwaitingJudgeRecord(this.context.awaitingJudgeRun);
	};

	public readonly writeAwaitingJudgeRecord = async (
		run: string,
	): Promise<void> => {
		const paths = benchmarkRunPaths(this.context.runsDirectory, run);
		await Bun.write(paths.stageFile("build"), StoppedStageData.awaitingJudge());
	};

	public readonly writeStoppedRunWithoutManifest = async (): Promise<void> => {
		const paths = benchmarkRunPaths(
			this.context.runsDirectory,
			this.context.stoppedRun,
		);

		await mkdir(paths.checkpointsDirectory, { recursive: true });

		await Bun.write(paths.stageFile("build"), StoppedStageData.stoppedStage());
	};
}

export { StoppedStageRecords as default };
