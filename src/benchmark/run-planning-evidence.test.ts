import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { parseCheckpointRecord } from "./checkpoint";
import type { CalibrationResult } from "./contracts";
import { runGradedStages } from "./run";
import {
	StageContextBuilder,
	seedRunBacklog,
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import {
	SHA256_HEX_DIGITS,
	committingStageDependencies,
	fakeStageDependencies,
	stageFixture,
} from "./run-stage-dependencies-test-fixture";
import type {
	StageJudgeExecution,
	StageJudgment,
} from "./run-stage-judge-test-fixtures";

const FIRST_CHECKPOINT_INDEX = 0;
const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});

const carriesPlanningCommits = async (): Promise<void> => {
	const { dependencies, judged, buildBaselines } =
		committingStageDependencies();

	const outcome = await runGradedStages(
		dependencies,
		await new StageContextBuilder().build(),
	);

	const [observedFirstJudged] = judged;

	expect(observedFirstJudged?.taskState).toBe("the task card");
	expect(observedFirstJudged?.diff).toBe("glossary-diff");
	expect(observedFirstJudged?.changedPaths).toEqual(["GLOSSARY.md"]);
	expect(judged.map(({ commitSubjects }) => commitSubjects)).toEqual([
		["shape commit"],
		["build commit"],
	]);
	expect(buildBaselines).toEqual(["shape-sha"]);
	expect(outcome.checkpoints.map(({ targetSha }) => targetSha)).toEqual([
		"shape-sha",
		"result-sha",
	]);
};

const chainsCheckpointLineage = async (): Promise<void> => {
	const { dependencies, context } = await stageFixture();
	await seedRunBacklog(context);

	const outcome = await runGradedStages(dependencies, context);

	expect(outcome.checkpoints.map(({ stage }) => stage)).toEqual([
		"shape",
		"build",
	]);
	const [observedFirstCheckpoint, observedSecondCheckpoint] =
		outcome.checkpoints;

	expect(observedFirstCheckpoint?.upstream).toBe(context.initialLineage);
	expect(observedSecondCheckpoint?.upstream).toBe(
		observedFirstCheckpoint?.lineage,
	);
	expect(observedFirstCheckpoint?.targetSha).toBe("task-sha");
	expect(observedSecondCheckpoint?.targetSha).toBe("result-sha");
	expect(
		outcome.checkpoints[FIRST_CHECKPOINT_INDEX]?.artifacts.map(
			({ path }) => path,
		),
	).toEqual(["backlog/docs/shape.md"]);
};

const recordsSharedSettings = async (): Promise<void> => {
	const { dependencies, settingsOverlays } = fakeStageDependencies();
	const settings = {
		hashed: {
			path: "stage-settings.json",
			sha256: "b".repeat(SHA256_HEX_DIGITS),
		},
		json: '{"disableAllHooks":true}',
	};
	const context = {
		...(await new StageContextBuilder().build()),
		loadedSettings: settings,
	};

	const outcome = await runGradedStages(dependencies, context);

	expect(settingsOverlays).toEqual([settings.json, settings.json]);
	expect(outcome.checkpoints.map(({ settingsFile }) => settingsFile)).toEqual([
		settings.hashed,
		settings.hashed,
	]);
	await Array.fromAsync(outcome.checkpoints, async (checkpoint) => {
		const written = await Bun.file(
			join(context.checkpointDirectory(checkpoint.stage), "checkpoint.json"),
		).text();
		expect(parseCheckpointRecord(written)).toEqual(checkpoint);
	});
};

const keepsAcceptedCheckpoints = async (): Promise<void> => {
	const { dependencies, scorecardFor } = fakeStageDependencies();
	const context = {
		...(await new StageContextBuilder().build()),
		calibrateStageFailure: async (): Promise<CalibrationResult> =>
			await Promise.resolve<CalibrationResult>({
				humanReview: { findings: [], summary: "failed", verdict: "REJECT" },
				instructionsChanged: false,
				rubricChanged: false,
				stageRubricsChanged: [],
			}),
	};
	const failing = {
		...dependencies,
		runStageJudge: async (
			_execution: StageJudgeExecution,
			{ input }: StageJudgment,
		) =>
			await Promise.resolve(
				scorecardFor(input, input.stage === "build" ? "STOP" : "CONTINUE"),
			),
	};

	expect(runGradedStages(failing, context)).rejects.toThrow(
		"minimum grade is B",
	);

	const completedCheckpointExists = await Bun.file(
		join(context.checkpointDirectory("shape"), "checkpoint.json"),
	).exists();
	expect(completedCheckpointExists).toBe(true);
	const buildCheckpointExists = await Bun.file(
		join(context.checkpointDirectory("build"), "checkpoint.json"),
	).exists();
	expect(buildCheckpointExists).toBe(false);
};
const preservesCheckpointBytes = async (): Promise<void> => {
	const { dependencies, context } = await stageFixture();
	await seedRunBacklog(context);

	const outcome = await runGradedStages(dependencies, context);

	await Array.fromAsync(outcome.checkpoints, async (record) => {
		const savedCheckpointText = await Bun.file(
			join(context.checkpointDirectory(record.stage), "checkpoint.json"),
		).text();
		const written: unknown = JSON.parse(savedCheckpointText);
		expect(written).toEqual(record);
	});
};
describe("runGradedStages planning and checkpoints", () => {
	it(
		"carries a planning stage's commits into evidence and the baseline",
		carriesPlanningCommits,
	);

	it(
		"writes a checkpoint for every accepted stage and chains lineage",
		chainsCheckpointLineage,
	);

	it(
		"delivers one settings value to every stage and records its evidence",
		recordsSharedSettings,
	);

	it(
		"keeps accepted checkpoints when a later stage is rejected",
		keepsAcceptedCheckpoints,
	);
	it(
		"saves every accepted checkpoint exactly as it returns it",
		preservesCheckpointBytes,
	);
});
