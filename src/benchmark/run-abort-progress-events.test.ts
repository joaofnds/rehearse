import { describe, expect, it } from "bun:test";

import { createRunAbort } from "./run-abort";
import { loadDefaultPipeline } from "./run-abort-artifact-test-harness";
import StageScorecardBuilder from "./run-abort-scorecard-builder";
import StageJudgeInputBuilder from "./run-abort-stage-input-builder";
import RunAbortBuilder from "./run-abort-test-builder";
import { buildRunArtifact } from "./run-artifact";
import RunArtifactInputsBuilder from "./run-artifact-inputs-builder";
import ControlledRunArtifactPersistence from "./run-artifact-persistence-test-fixture";
import { AUDIT_LOG_PIPELINE_PATH, fakeRunEventRecorder } from "./test-support";

const INJECTED_ELAPSED_MS = 500;

const FINAL_RUN_EVENT_OFFSET = -1;

const SHA256_HEX_DIGITS = 64;

async function testRecordsAStageJudgingRunEventWithTheStageSOwnSpendBeforeThePendingStageWriteSettles(): Promise<void> {
	const persistence = new ControlledRunArtifactPersistence();
	const runEvents = fakeRunEventRecorder();
	const abort = new RunAbortBuilder({
		dependencies: { persistence, runEvents },
		request: {
			artifactFile: "/runs/run.json",
			operatorStopFile: "/runs/operator-stop.json",
		},
	}).build();

	await abort.writePendingStage({
		file: "/runs/shape.json",
		input: new StageJudgeInputBuilder({ stage: "shape" }).build(),
		stage: "shape",
	});

	expect(
		runEvents.events.map(({ kind, stage, spentUsd }) => ({
			kind,
			spentUsd,
			stage,
		})),
	).toEqual([{ kind: "stage-judging", spentUsd: 1, stage: "shape" }]);
}

async function testRecordsAStageCompletedRunEventCarryingTheStageSessionAndJudgeSpendWhenAStageFinishes(): Promise<void> {
	const expectedSpentUsd = 2;

	const persistence = new ControlledRunArtifactPersistence();
	const runEvents = fakeRunEventRecorder();
	const abort = new RunAbortBuilder({
		dependencies: { persistence, runEvents },
		request: {
			artifactFile: "/runs/run.json",
			operatorStopFile: "/runs/operator-stop.json",
		},
	}).build();

	await abort.writePendingStage({
		file: "/runs/shape.json",
		input: new StageJudgeInputBuilder({ stage: "shape" }).build(),
		stage: "shape",
	});

	await abort.completeStage({
		...new StageScorecardBuilder({ requirementStatus: "PASS" }).build(),
		corpusFiles: [],
		corpusVersion: { digest: "c".repeat(SHA256_HEX_DIGITS), kind: "version" },
		judgeModel: "opus",
		model: "sonnet",
		readManifest: [],
		sessionBudgetUsd: 5,
	});

	expect(runEvents.events.map(({ kind, stage }) => ({ kind, stage }))).toEqual([
		{ kind: "stage-judging", stage: "shape" },
		{ kind: "stage-completed", stage: "shape" },
	]);
	expect(runEvents.events.at(FINAL_RUN_EVENT_OFFSET)?.spentUsd).toBe(
		expectedSpentUsd,
	);
}

async function testRecordsElapsedTimeExactlyAsTheInjectedElapsedMsFunctionReportsItWithNoOriginOfItsOwn(): Promise<void> {
	const expectedInjectedElapsedMs = 500;

	const persistence = new ControlledRunArtifactPersistence();
	const runEvents = fakeRunEventRecorder();
	const abort = new RunAbortBuilder({
		dependencies: {
			elapsedMs: () => INJECTED_ELAPSED_MS,
			persistence,
			runEvents,
		},
		request: {
			artifactFile: "/runs/run.json",
			operatorStopFile: "/runs/operator-stop.json",
		},
	}).build();

	await abort.writePendingStage({
		file: "/runs/shape.json",
		input: new StageJudgeInputBuilder({ stage: "shape" }).build(),
		stage: "shape",
	});
	await abort.completeStage({
		...new StageScorecardBuilder({ requirementStatus: "PASS" }).build(),
		corpusFiles: [],
		corpusVersion: { digest: "c".repeat(SHA256_HEX_DIGITS), kind: "version" },
		judgeModel: "opus",
		model: "sonnet",
		readManifest: [],
		sessionBudgetUsd: 5,
	});

	expect(runEvents.events.map(({ elapsedMs }) => elapsedMs)).toEqual([
		expectedInjectedElapsedMs,
		expectedInjectedElapsedMs,
	]);
}

async function testRecordsARunCompletedRunEventWhenTheArtifactReachesItsTerminalWrite(): Promise<void> {
	const expectedElapsedMs = 500;

	const persistence = new ControlledRunArtifactPersistence();
	const runEvents = fakeRunEventRecorder();
	const pipeline = await loadDefaultPipeline();
	const artifact = buildRunArtifact(
		new RunArtifactInputsBuilder()
			.withPipeline(pipeline, AUDIT_LOG_PIPELINE_PATH)
			.build(),
	);
	const abort = new RunAbortBuilder({
		dependencies: {
			elapsedMs: () => INJECTED_ELAPSED_MS,
			persistence,
			runEvents,
		},
		request: {
			artifactFile: "/runs/run.json",
			operatorStopFile: "/runs/operator-stop.json",
		},
	}).build();

	await abort.completeArtifact({ ...artifact, status: "COMPLETE" });

	expect(runEvents.events.map(({ kind }) => kind)).toEqual(["run-completed"]);
	expect(runEvents.events.at(FINAL_RUN_EVENT_OFFSET)?.elapsedMs).toBe(
		expectedElapsedMs,
	);
}

async function testRecordsARunCompletedRunEventWhenAPausedRunSArtifactAwaitsReview(): Promise<void> {
	const expectedElapsedMs = 500;

	const persistence = new ControlledRunArtifactPersistence();
	const runEvents = fakeRunEventRecorder();
	const pipeline = await loadDefaultPipeline();
	const artifact = buildRunArtifact(
		new RunArtifactInputsBuilder()
			.withPipeline(pipeline, AUDIT_LOG_PIPELINE_PATH)
			.build(),
	);
	const abort = new RunAbortBuilder({
		dependencies: {
			elapsedMs: () => INJECTED_ELAPSED_MS,
			persistence,
			runEvents,
		},
		request: {
			artifactFile: "/runs/run.json",
			operatorStopFile: "/runs/operator-stop.json",
		},
	}).build();

	await abort.writePendingArtifact(artifact);

	await abort.awaitArtifactReview();

	expect(runEvents.events.map(({ kind }) => kind)).toEqual(["run-completed"]);
	expect(runEvents.events.at(FINAL_RUN_EVENT_OFFSET)?.elapsedMs).toBe(
		expectedElapsedMs,
	);
}

describe(createRunAbort.name, () => {
	describe("when recording stage and run progress", () => {
		it(
			"records a stage-judging run event with the stage's own spend before the pending stage write settles",
			testRecordsAStageJudgingRunEventWithTheStageSOwnSpendBeforeThePendingStageWriteSettles,
		);
		it(
			"records a stage-completed run event carrying the stage session and Judge spend when a stage finishes",
			testRecordsAStageCompletedRunEventCarryingTheStageSessionAndJudgeSpendWhenAStageFinishes,
		);
		it(
			"records elapsed time exactly as the injected elapsedMs function reports it, with no origin of its own",
			testRecordsElapsedTimeExactlyAsTheInjectedElapsedMsFunctionReportsItWithNoOriginOfItsOwn,
		);
		it(
			"records a run-completed run event when the artifact reaches its terminal write",
			testRecordsARunCompletedRunEventWhenTheArtifactReachesItsTerminalWrite,
		);
		it(
			"records a run-completed run event when a paused run's artifact awaits review",
			testRecordsARunCompletedRunEventWhenAPausedRunSArtifactAwaitsReview,
		);
	});
});
