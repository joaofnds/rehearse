import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { SymlinkedEntryError } from "./file-presence";
import type { ReplayDependencies } from "./replay";
import runReplayConfirmation from "./replay-confirmation";
import ReplayCorpusBuilder from "./replay-confirmation-corpus-test-builder";
import ReplayConfirmationFixtureBuilder from "./replay-confirmation-fixture-builder";
import { readShortIds } from "./short-id";
import { TestResources } from "./test-support";

const SHA256_HEX_DIGITS = 64;

const testResources = TestResources.forEachTest();

const refusesAForeignLayoutBeforeCreatingAReplayRepetition =
	async (): Promise<void> => {
		const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
			testResources,
		);
		const root = join(run.paths.runsDirectory, "corpus");
		const outside = join(run.paths.runsDirectory, "foreign");
		await new ReplayCorpusBuilder({
			files: [{ content: "discuss\n", path: "skills/discuss/SKILL.md" }],
		}).writeForeignTo(root, outside);

		const { dependencies: replayDependencies, request: replayRequest } =
			harness.prepareConfirmation(
				{ corpusRoots: [{ kind: "directory", root }], paths: run.paths },
				{},
			);

		const failure = await failureOf(
			runReplayConfirmation(replayDependencies, replayRequest),
		);

		expect(failure).toBeInstanceOf(SymlinkedEntryError);
		expect(harness.worktrees).toEqual([]);
		expect(harness.stageDirs).toEqual([]);
		expect(await readShortIds(run.paths.runsDirectory, "audit-log")).toEqual(
			[],
		);
	};

const usesTheRecordedTargetForDeliveryReplayConfirmations =
	async (): Promise<void> => {
		const { harness: fake, run } =
			await new ReplayConfirmationFixtureBuilder().build(testResources);
		const corpusRoot = await new ReplayCorpusBuilder().build(testResources);

		const { dependencies: replayDependencies, request: replayRequest } =
			fake.prepareConfirmation(
				{
					corpusRoots: [{ kind: "directory", root: corpusRoot }],
					paths: run.paths,
				},
				{ reps: 2, stage: "build" },
			);

		await runReplayConfirmation(replayDependencies, replayRequest);

		expect(fake.integrityFileSets).toEqual([
			run.manifest.pipeline.target.integrityFiles,
			run.manifest.pipeline.target.integrityFiles,
		]);
		const checksWithNoServices = run.manifest.pipeline.target.checks.map(
			({ command }) => ({ command, env: {} }),
		);
		expect(fake.targetChecks).toEqual([
			checksWithNoServices,
			checksWithNoServices,
		]);
	};

const checksEveryRepsWorktreeOutFromTheRepositoryItsSource =
	async (): Promise<void> => {
		const { harness: fake, run } =
			await new ReplayConfirmationFixtureBuilder().build(testResources);
		const corpusRoot = await new ReplayCorpusBuilder({
			files: [{ content: "discuss corpus\n", path: "skills/discuss/SKILL.md" }],
		}).build(testResources);
		const sources: Parameters<ReplayDependencies["replaySourceRoot"]>[] = [];

		const { dependencies: replayDependencies, request: replayRequest } =
			fake.prepareConfirmation(
				{
					corpusRoots: [{ kind: "directory", root: corpusRoot }],
					paths: run.paths,
				},
				{ declaredTargetRoot: "/declared/target", reps: 2 },
				(defaults) => ({
					...defaults,
					replaySourceRoot: async (...source) => {
						sources.push(source);

						return await Promise.resolve("/declared/target");
					},
				}),
			);

		await runReplayConfirmation(replayDependencies, replayRequest);

		expect(sources).toEqual([
			[
				{
					checkout: run.manifest.sourceRoot,
					declared: "/declared/target",
					target: run.manifest.targetRoot,
				},
				run.initial.targetSha,
			],
		]);
		expect(fake.worktrees.map(({ root }) => root)).toEqual([
			"/declared/target",
			"/declared/target",
		]);
	};

const passesADeclaredSettingsOverlayToEveryConfirmedStageSession =
	async (): Promise<void> => {
		const { harness: fake, run } =
			await new ReplayConfirmationFixtureBuilder().build(testResources);
		const corpusRoot = await new ReplayCorpusBuilder({
			files: [{ content: "discuss\n", path: "skills/discuss/SKILL.md" }],
		}).build(testResources);

		const { dependencies: replayDependencies, request: replayRequest } =
			fake.prepareConfirmation(
				{
					corpusRoots: [{ kind: "directory", root: corpusRoot }],
					paths: run.paths,
				},
				{
					loadedSettings: {
						hashed: {
							path: "stage-settings.json",
							sha256: "a".repeat(SHA256_HEX_DIGITS),
						},
						json: '{"disableAllHooks":true}',
					},
					reps: 2,
				},
			);

		await runReplayConfirmation(replayDependencies, replayRequest);

		expect(fake.settingsOverlays).toEqual([
			'{"disableAllHooks":true}',
			'{"disableAllHooks":true}',
		]);
	};
const runsEveryConfirmedStageSessionWithTheUserSActualSetup =
	async (): Promise<void> => {
		const { harness: fake, run } =
			await new ReplayConfirmationFixtureBuilder().build(testResources);
		const corpusRoot = await new ReplayCorpusBuilder({
			files: [{ content: "discuss\n", path: "skills/discuss/SKILL.md" }],
		}).build(testResources);

		const { dependencies: replayDependencies, request: replayRequest } =
			fake.prepareConfirmation(
				{
					corpusRoots: [{ kind: "directory", root: corpusRoot }],
					paths: run.paths,
				},
				{ reps: 2 },
			);

		await runReplayConfirmation(replayDependencies, replayRequest);

		expect(fake.stageSetups).toEqual(["actual", "actual"]);
	};
describe(runReplayConfirmation.name, () => {
	describe("source inputs", () => {
		it(
			"refuses a foreign layout before creating a replay repetition",
			refusesAForeignLayoutBeforeCreatingAReplayRepetition,
		);

		it(
			"uses the recorded target for delivery replay confirmations",
			usesTheRecordedTargetForDeliveryReplayConfirmations,
		);

		it(
			"checks every rep's worktree out from the repository its source resolves to",
			checksEveryRepsWorktreeOutFromTheRepositoryItsSource,
		);

		it(
			"passes a declared settings overlay to every confirmed stage session",
			passesADeclaredSettingsOverlayToEveryConfirmedStageSession,
		);

		it(
			"runs every confirmed stage session with the user's actual setup",
			runsEveryConfirmedStageSessionWithTheUserSActualSetup,
		);
	});
});
