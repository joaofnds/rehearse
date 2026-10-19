import { mkdir } from "node:fs/promises";

import { writeRunManifest } from "./manifest";
import type {
	RecordedRunsContext,
	RecordedRunsFixtureProps,
} from "./recorded-runs-fixture-context";
import RecordedEventLog from "./recorded-runs-fixture-event-log";
import PipelineRecordData from "./recorded-runs-fixture-pipeline-data";
import {
	DEFAULT_RUNNING_STAGE_ELAPSED_MS,
	DEFAULT_RUNNING_STAGE_SPENT_USD,
} from "./recorded-runs-fixture-readings";
import type { RunningStageMetrics } from "./recorded-runs-fixture-record-io";
import type { JudgeProgress, PlainRunEventKind } from "./run-events";
import { benchmarkRunPaths } from "./run-layout";
import type { RunTokens } from "./spend-ceiling";

interface EventsOnlyRunEvent {
	readonly kind: PlainRunEventKind;
	readonly stage: string;
}

interface WriteRunWithLatestEventReadings {
	readonly kind: PlainRunEventKind;
	readonly stage: string;
	readonly spentUsd: number;
	readonly elapsedMs: number;
}
interface WriteRunningRunUnderCeilingProps {
	readonly runSpentUsd: number;
	readonly runTokens?: RunTokens;
	readonly spendCeilingUsd: number;
}

class RunEventRecords {
	private readonly context: RecordedRunsContext;
	private readonly eventLog: RecordedEventLog;
	public constructor(props: RecordedRunsFixtureProps) {
		this.context = props.context;
		this.eventLog = new RecordedEventLog(props);
	}

	public readonly writeNoRecordRun = async (): Promise<void> => {
		const paths = benchmarkRunPaths(
			this.context.runsDirectory,
			this.context.noRecordRun,
		);

		await mkdir(paths.checkpointsDirectory, { recursive: true });

		await writeRunManifest(
			paths.manifestFile,
			PipelineRecordData.manifest({
				sourceRoot: this.context.sourceRoot,
				timestamp: this.context.noRecordRun,
			}),
		);
	};

	public readonly writeInterruptedRun = async (): Promise<void> => {
		const paths = benchmarkRunPaths(
			this.context.runsDirectory,
			this.context.interruptedRun,
		);

		await mkdir(paths.checkpointsDirectory, { recursive: true });

		await writeRunManifest(
			paths.manifestFile,
			PipelineRecordData.manifest({
				sourceRoot: this.context.sourceRoot,
				timestamp: this.context.interruptedRun,
			}),
		);

		await this.eventLog.append([
			{
				elapsedMs: 5000,
				kind: "run-interrupted",
				runId: this.context.interruptedRun,
				spentUsd: 1,
				stage: "build",
			},
		]);
	};

	public readonly writeRunningRun = async (
		kind: PlainRunEventKind = "turn-completed",
		stage = "build",
		{
			spentUsd = DEFAULT_RUNNING_STAGE_SPENT_USD,
			elapsedMs = DEFAULT_RUNNING_STAGE_ELAPSED_MS,
		}: RunningStageMetrics = {},
	): Promise<void> => {
		await this.writeRunWithLatestEvent(this.context.runningRun, {
			elapsedMs,
			kind,
			spentUsd,
			stage,
		});
	};

	public readonly writeCompletedRunWithoutArtifact =
		async (): Promise<void> => {
			await this.writeRunWithLatestEvent(this.context.unrecordedArtifactRun, {
				elapsedMs: 12_000,
				kind: "run-completed",
				spentUsd: 3,
				stage: "build",
			});
		};

	public readonly writeLaterRunningRun = async (): Promise<void> => {
		await this.writeRunWithLatestEvent(this.context.laterRunningRun, {
			elapsedMs: 4000,
			kind: "turn-completed",
			spentUsd: 0.4,
			stage: "build",
		});
	};

	public readonly writeRunWithLatestEvent = async (
		run: string,
		latest: WriteRunWithLatestEventReadings,
	): Promise<void> => {
		const paths = benchmarkRunPaths(this.context.runsDirectory, run);

		await mkdir(paths.checkpointsDirectory, { recursive: true });

		await writeRunManifest(
			paths.manifestFile,
			PipelineRecordData.manifest({
				sourceRoot: this.context.sourceRoot,
				timestamp: run,
			}),
		);

		await this.eventLog.append([
			{
				elapsedMs: 0,
				kind: "stage-started",
				runId: run,
				spentUsd: 0,
				stage: latest.stage,
			},
			{ runId: run, ...latest },
		]);
	};

	public readonly writeRunningRunUnderCeiling = async (
		props: WriteRunningRunUnderCeilingProps,
	): Promise<void> => {
		const paths = benchmarkRunPaths(
			this.context.runsDirectory,
			this.context.runningRun,
		);

		await mkdir(paths.checkpointsDirectory, { recursive: true });

		await writeRunManifest(paths.manifestFile, {
			...PipelineRecordData.manifest({
				sourceRoot: this.context.sourceRoot,
				timestamp: this.context.runningRun,
			}),
			spendCeilingUsd: props.spendCeilingUsd,
		});

		await this.eventLog.append([
			{
				elapsedMs: 9000,
				kind: "turn-completed",
				runId: this.context.runningRun,
				runSpentUsd: props.runSpentUsd,
				runTokens: props.runTokens,
				spentUsd: 0.9,
				stage: "build",
			},
		]);
	};

	public readonly appendRunningEvent = async (
		kind: PlainRunEventKind,
		stage: string,
		elapsedMs: number,
	): Promise<void> => {
		await this.eventLog.append([
			{
				elapsedMs,
				kind,
				runId: this.context.runningRun,
				spentUsd: 0.4,
				stage,
			},
		]);
	};

	public readonly appendRunningJudgeProgress = async (
		judge: JudgeProgress,
		stage = "build",
	): Promise<void> => {
		await this.eventLog.append([
			{
				elapsedMs: 9500,
				judge,
				kind: "judge-progress",
				runId: this.context.runningRun,
				spentUsd: 0.9,
				stage,
			},
		]);
	};

	public readonly writeSignalAbortedRun = async (): Promise<void> => {
		const paths = benchmarkRunPaths(
			this.context.runsDirectory,
			this.context.abortedRun,
		);

		await mkdir(paths.checkpointsDirectory, { recursive: true });

		await writeRunManifest(
			paths.manifestFile,
			PipelineRecordData.manifest({
				sourceRoot: this.context.sourceRoot,
				timestamp: this.context.abortedRun,
			}),
		);

		await this.eventLog.append([
			{
				elapsedMs: 0,
				kind: "stage-started",
				runId: this.context.abortedRun,
				spentUsd: 0,
				stage: "build",
			},
			{
				elapsedMs: 7000,
				kind: "run-failed",
				runId: this.context.abortedRun,
				spentUsd: 2,
				stage: "build",
			},
		]);
	};

	public readonly writeInterruptedRunWithoutManifest =
		async (): Promise<void> => {
			const paths = benchmarkRunPaths(
				this.context.runsDirectory,
				this.context.interruptedRun,
			);

			await mkdir(paths.checkpointsDirectory, { recursive: true });

			await this.eventLog.append([
				{
					elapsedMs: 5000,
					kind: "run-interrupted",
					runId: this.context.interruptedRun,
					spentUsd: 1,
					stage: "build",
				},
			]);
		};
	public readonly writeEventsOnlyFailedRun = async (): Promise<void> => {
		await this.appendRunEvents([{ kind: "run-failed", stage: "shape" }]);
	};
	public readonly writeEventsOnlyFailedRunNamingNoStage = async (
		startedStages: readonly string[],
	): Promise<void> => {
		await this.appendRunEvents([
			...startedStages.map((stage) => ({
				kind: "stage-started" as const,
				stage,
			})),
			{ kind: "run-failed", stage: "" },
		]);
	};
	private readonly appendRunEvents = async (
		events: readonly EventsOnlyRunEvent[],
	): Promise<void> => {
		await this.eventLog.append(
			events.map(({ kind, stage }) => ({
				elapsedMs: 100,
				kind,
				runId: this.context.eventsOnlyRun,
				spentUsd: 0,
				stage,
			})),
		);
	};
}
export { RunEventRecords as default };
