import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";

import { lineageKey } from "./checkpoint";
import { parseReplayArgs } from "./config";
import type { ReplayDependencies } from "./replay";
import { runReplay } from "./replay";
import ReplayConfirmationHarness from "./replay-confirmation-test-support";
import ReplaySavedRunBuilder, {
	SPEC_CONTENT,
	SPEC_PATH,
} from "./replay-saved-run-test-builder";
import { ReplayRequestBuilder } from "./replay-test-fixtures";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();
const lowerBoundForStageDirsCount = 0;
const expectedStageCostUsd = 1.25;
const expectedJudgeCostUsd = 0.5;
const DELIVERY_ARGUMENTS = [
	"--stage",
	"build",
	"--model",
	"sonnet",
	"--session-budget-usd",
	"5",
];
const replaysADeliveryStageInTheWorktreeAndNever = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder().build(testResources);
	const fake = new ReplayConfirmationHarness();
	const config = parseReplayArgs(
		["--run", run.paths.name, ...DELIVERY_ARGUMENTS],
		{},
	);

	await runReplay(fake.dependencies, {
		...new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		judgeModel: config.judgeModel,
		model: config.model,
	});
	const [worktree] = fake.worktrees;

	expect(worktree?.root).toBe(run.manifest.sourceRoot);
	expect(worktree?.sha).toBe(run.discuss.targetSha);
	expect(fake.branchExpectations).toEqual([null]);
	expect(fake.removed).toEqual([worktree?.path ?? ""]);
};
const passesTargetChecksToTheDeliverySession = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder().build(testResources);
	const fake = new ReplayConfirmationHarness();
	const config = parseReplayArgs(
		["--run", run.paths.name, ...DELIVERY_ARGUMENTS],
		{},
	);

	await runReplay(fake.dependencies, {
		...new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		judgeModel: config.judgeModel,
		model: config.model,
	});
	const [worktree] = fake.worktrees;

	expect(fake.stageDirs.length).toBeGreaterThan(lowerBoundForStageDirsCount);
	expect(fake.stageDirs.every((dir) => dir === worktree?.path)).toBe(true);
	expect(fake.setups.map(({ targetDir }) => targetDir)).toEqual([
		worktree?.path ?? "",
	]);
	expect(fake.integrityFileSets).toEqual([
		run.manifest.pipeline.target.integrityFiles,
	]);
	expect(fake.targetChecks).toEqual([
		[{ command: ["bun", "--version"], env: {} }],
	]);
};
const carriesPriorArtifactsIntoTheJudge = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder().build(testResources);
	const fake = new ReplayConfirmationHarness();
	const config = parseReplayArgs(
		["--run", run.paths.name, ...DELIVERY_ARGUMENTS],
		{},
	);

	const outcome = await runReplay(fake.dependencies, {
		...new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		judgeModel: config.judgeModel,
		model: config.model,
	});
	const [observedFirstJudged] = fake.judged;

	expect(observedFirstJudged?.priorArtifacts).toEqual([
		{ content: SPEC_CONTENT, path: SPEC_PATH },
	]);
	expect(observedFirstJudged?.commitSubjects).toEqual(["replayed commit"]);
	expect(outcome.record.scorecard.input.commitSubjects).toEqual([
		"replayed commit",
	]);
};
const recordsConsumedLineageAndRecordLocation = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder().build(testResources);
	const fake = new ReplayConfirmationHarness();
	const config = parseReplayArgs(
		["--run", run.paths.name, ...DELIVERY_ARGUMENTS],
		{},
	);

	const outcome = await runReplay(fake.dependencies, {
		...new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		judgeModel: config.judgeModel,
		model: config.model,
	});

	expect(outcome.record.consumed).toEqual({
		lineage: run.discuss.lineage,
		stage: "discuss",
		targetSha: "task-sha",
	});
	expect(outcome.record.lineage).toBe(
		lineageKey({
			corpusFiles: [
				{
					path: "skills/build/SKILL.md",
					sha256: createHash("sha256").update("build").digest("hex"),
				},
			],
			model: "sonnet",
			upstream: run.discuss.lineage,
		}),
	);
	expect(outcome.recordPath.startsWith(run.paths.replaysDirectory)).toBe(true);
	expect(outcome.recordPath).toContain(run.discuss.lineage);
};
const recordsResolvedModelsAndPaidCosts = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder().build(testResources);
	const fake = new ReplayConfirmationHarness();
	const config = parseReplayArgs(
		["--run", run.paths.name, ...DELIVERY_ARGUMENTS],
		{},
	);

	const outcome = await runReplay(fake.dependencies, {
		...new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		judgeModel: config.judgeModel,
		model: config.model,
	});

	expect(outcome.record.stageCostUsd).toBe(expectedStageCostUsd);
	expect(outcome.record.judgeCostUsd).toBe(expectedJudgeCostUsd);
	expect({
		judgeModel: outcome.record.judgeModel,
		model: outcome.record.model,
	}).toEqual({ judgeModel: "opus", model: "sonnet" });
	expect(outcome.record.resultSha).toBe("result-sha");
};
const checksItsWorktreeOutFromTheRepositoryItsSource =
	async (): Promise<void> => {
		const run = await new ReplaySavedRunBuilder().build(testResources);
		const sources: Parameters<ReplayDependencies["replaySourceRoot"]>[] = [];
		const fake = new ReplayConfirmationHarness((defaults) => ({
			...defaults,
			replaySourceRoot: async (...source) => {
				sources.push(source);

				return await Promise.resolve("/declared/target");
			},
		}));

		await runReplay(fake.dependencies, {
			...new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
			declaredTargetRoot: "/declared/target",
		});

		expect(sources).toEqual([
			[
				{
					checkout: run.manifest.sourceRoot,
					declared: "/declared/target",
					target: run.manifest.targetRoot,
				},
				run.discuss.targetSha,
			],
		]);
		expect(fake.worktrees.map(({ root }) => root)).toEqual([
			"/declared/target",
		]);
	};
const replaysTheFirstStageFromTheInitialCheckpointWithout =
	async (): Promise<void> => {
		const run = await new ReplaySavedRunBuilder().build(testResources);
		const fake = new ReplayConfirmationHarness();

		const outcome = await runReplay(
			fake.dependencies,
			new ReplayRequestBuilder({ stage: "discuss" }).build(run.paths),
		);

		const [observedFirstJudged] = fake.judged;

		expect(outcome.record.consumed.stage).toBe("initial");
		expect(fake.setups).toEqual([]);
		expect(fake.branchExpectations).toEqual([null]);
		expect(observedFirstJudged?.priorArtifacts).toEqual([]);
	};
const failsLoudlyWhenTheRunPredatesInitialCheckpoints =
	async (): Promise<void> => {
		const run = await new ReplaySavedRunBuilder().build(testResources);
		await rm(run.paths.checkpointDirectory("initial"), {
			force: true,
			recursive: true,
		});
		const fake = new ReplayConfirmationHarness();

		expect(
			runReplay(
				fake.dependencies,
				new ReplayRequestBuilder({ stage: "discuss" }).build(run.paths),
			),
		).rejects.toThrow(/no initial checkpoint/u);
		expect(fake.worktrees).toEqual([]);
	};
describe(runReplay.name, () => {
	describe("delivery and repository selection", () => {
		it(
			"passes the target integrity files and treatment checks to the session",
			passesTargetChecksToTheDeliverySession,
		);
		it(
			"carries accepted prior artifacts and commit subjects into the Judge",
			carriesPriorArtifactsIntoTheJudge,
		);
		it(
			"records the consumed lineage and record location",
			recordsConsumedLineageAndRecordLocation,
		);
		it(
			"records the resolved models and paid costs",
			recordsResolvedModelsAndPaidCosts,
		);
		it(
			"replays a delivery stage in a detached worktree",
			replaysADeliveryStageInTheWorktreeAndNever,
		);
		it(
			"checks its worktree out from the repository its source resolves to",
			checksItsWorktreeOutFromTheRepositoryItsSource,
		);
		it(
			"replays the first stage from the initial checkpoint without setting up the target",
			replaysTheFirstStageFromTheInitialCheckpointWithout,
		);
		it(
			"fails loudly when the run predates initial checkpoints",
			failsLoudlyWhenTheRunPredatesInitialCheckpoints,
		);
	});
});
