import { describe, expect, it } from "bun:test";

import { z } from "zod";

import type { PendingStage } from "./run-abort";
import { createRunAbort } from "./run-abort";
import StageScorecardBuilder from "./run-abort-scorecard-builder";
import StageJudgeInputBuilder from "./run-abort-stage-input-builder";
import RunAbortBuilder from "./run-abort-test-builder";
import ControlledRunArtifactPersistence from "./run-artifact-persistence-test-fixture";

const STAGE_FILE = "/runs/shape.json";

const SHA256_HEX_DIGITS = 64;

async function testRecordsAnInterruptedPendingStageAsFailedAfterTheActiveWriteSettles(): Promise<void> {
	const persistence = new ControlledRunArtifactPersistence();

	const blocked = persistence.blockNextWrite();
	const abort = new RunAbortBuilder({
		dependencies: { persistence },
		request: {
			artifactFile: "/runs/run.json",
			operatorStopFile: "/runs/operator-stop.json",
		},
	}).build();
	const pending: PendingStage = {
		file: STAGE_FILE,
		input: new StageJudgeInputBuilder({ stage: "shape" }).build(),
		stage: "shape",
	};

	const pendingWrite = abort.writePendingStage(pending);

	await blocked.started;

	const abortWrite = abort.markAborted("run interrupted");

	blocked.release();
	await Promise.all([pendingWrite, abortWrite]);

	expect(JSON.parse(persistence.files.get(STAGE_FILE) ?? "")).toMatchObject({
		error: "run interrupted",
		status: "STAGE_JUDGE_FAILED",
	});
}

async function testRecordsPendingStageStateWhenAbortPrecedesItsFirstWrite(): Promise<void> {
	const persistence = new ControlledRunArtifactPersistence();

	const abort = new RunAbortBuilder({
		dependencies: { persistence },
		request: {
			artifactFile: "/runs/run.json",
			operatorStopFile: "/runs/operator-stop.json",
		},
	}).build();

	const pendingWrite = abort.writePendingStage({
		file: STAGE_FILE,
		input: new StageJudgeInputBuilder({ stage: "shape" }).build(),
		stage: "shape",
	});
	const abortWrite = abort.markAborted("run interrupted");

	await Promise.all([pendingWrite, abortWrite]);

	expect(JSON.parse(persistence.files.get(STAGE_FILE) ?? "")).toMatchObject({
		status: "STAGE_JUDGE_FAILED",
	});
}

async function testRefusesANormalStageTransitionAfterAbortIsRequested(): Promise<void> {
	const persistence = new ControlledRunArtifactPersistence();

	const abort = new RunAbortBuilder({
		dependencies: { persistence },
		request: {
			artifactFile: "/runs/run.json",
			operatorStopFile: "/runs/operator-stop.json",
		},
	}).build();

	await abort.writePendingStage({
		file: STAGE_FILE,
		input: new StageJudgeInputBuilder({ stage: "shape" }).build(),
		stage: "shape",
	});

	const abortWrite = abort.markAborted("run interrupted");
	const completionWrite = abort.completeStage({
		...new StageScorecardBuilder({ requirementStatus: "PASS" }).build(),
		corpusFiles: [],
		corpusVersion: { digest: "c".repeat(SHA256_HEX_DIGITS), kind: "version" },
		judgeModel: "opus",
		model: "sonnet",
		readManifest: [],
		sessionBudgetUsd: 5,
	});

	await Promise.all([abortWrite, completionWrite]);

	expect(JSON.parse(persistence.files.get(STAGE_FILE) ?? "")).toMatchObject({
		status: "STAGE_JUDGE_FAILED",
	});
}

async function testDoesNotStartAQueuedNormalStageTransitionAfterAbortIsRequested(): Promise<void> {
	const persistence = new ControlledRunArtifactPersistence();

	const blocked = persistence.blockNextWrite();
	const abort = new RunAbortBuilder({
		dependencies: { persistence },
		request: {
			artifactFile: "/runs/run.json",
			operatorStopFile: "/runs/operator-stop.json",
		},
	}).build();

	const pendingWrite = abort.writePendingStage({
		file: STAGE_FILE,
		input: new StageJudgeInputBuilder({ stage: "shape" }).build(),
		stage: "shape",
	});

	await blocked.started;

	const completionWrite = abort.completeStage({
		...new StageScorecardBuilder({ requirementStatus: "PASS" }).build(),
		corpusFiles: [],
		corpusVersion: { digest: "c".repeat(SHA256_HEX_DIGITS), kind: "version" },
		judgeModel: "opus",
		model: "sonnet",
		readManifest: [],
		sessionBudgetUsd: 5,
	});
	const abortWrite = abort.markAborted("run interrupted");

	blocked.release();
	await Promise.all([pendingWrite, completionWrite, abortWrite]);

	expect(
		persistence.writes.map(
			(contents) =>
				z.object({ status: z.string() }).parse(JSON.parse(contents)).status,
		),
	).toEqual(["AWAITING_STAGE_JUDGE", "STAGE_JUDGE_FAILED"]);
}

describe(createRunAbort.name, () => {
	describe("when stage writes and abort requests overlap", () => {
		it(
			"records an interrupted pending stage as failed after the active write settles",
			testRecordsAnInterruptedPendingStageAsFailedAfterTheActiveWriteSettles,
		);
		it(
			"records pending stage state when abort precedes its first write",
			testRecordsPendingStageStateWhenAbortPrecedesItsFirstWrite,
		);
		it(
			"refuses a normal stage transition after abort is requested",
			testRefusesANormalStageTransitionAfterAbortIsRequested,
		);
		it(
			"does not start a queued normal stage transition after abort is requested",
			testDoesNotStartAQueuedNormalStageTransitionAfterAbortIsRequested,
		);
	});
});
