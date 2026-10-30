import { describe, expect, it } from "bun:test";

import { captureStageCorpus, installStageCorpusSnapshot } from "./checkpoint";
import { runReplay } from "./replay";
import ReplayConfirmationHarness from "./replay-confirmation-test-support";
import ReplayCorpusVariantBuilder from "./replay-corpus-variant-test-builder";
import ReplaySavedRunBuilder from "./replay-saved-run-test-builder";
import { ReplayRequestBuilder } from "./replay-test-fixtures";
import { TestResources } from "./test-support";

const SHA256_HEX_DIGITS = 64;

const testResources = TestResources.forEachTest();
const runsTheStageWithTheActualSetupWhenGiven = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder().build(testResources);
	const fake = new ReplayConfirmationHarness();

	await runReplay(fake.dependencies, {
		...new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		setup: "actual",
	});

	expect(fake.stageSetups).toEqual(["actual"]);
};
const passesADeclaredSettingsOverlayThroughToTheStage =
	async (): Promise<void> => {
		const run = await new ReplaySavedRunBuilder().build(testResources);
		const fake = new ReplayConfirmationHarness();

		await runReplay(fake.dependencies, {
			...new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
			loadedSettings: {
				hashed: {
					path: "stage-settings.json",
					sha256: "a".repeat(SHA256_HEX_DIGITS),
				},
				json: '{"disableAllHooks":true}',
			},
		});

		expect(fake.settingsOverlays).toEqual(['{"disableAllHooks":true}']);
	};
const leavesTheSettingsOverlayUnsetWhenNoneIsGiven =
	async (): Promise<void> => {
		const run = await new ReplaySavedRunBuilder().build(testResources);
		const fake = new ReplayConfirmationHarness();

		await runReplay(
			fake.dependencies,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		);

		expect(fake.settingsOverlays).toEqual([undefined]);
	};
const installsTheCorpusSnapshotIntoTheWorktreeBeforeThe =
	async (): Promise<void> => {
		const run = await new ReplaySavedRunBuilder().build(testResources);
		const fake = new ReplayConfirmationHarness();

		await runReplay(fake.dependencies, {
			...new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
			corpusSource: { kind: "directory", root: "/frozen/corpus" },
		});

		const [observedFirstWorktree] = fake.worktrees;

		expect(fake.corpusInstalls).toEqual([
			{
				snapshotDirectory: "/frozen/corpus",
				targetDirectory: observedFirstWorktree?.path ?? "",
			},
		]);
	};
const replaysALinkedDirectoryVariantWithTheCapturedPaths =
	async (): Promise<void> => {
		const { source, instructions } =
			await new ReplayCorpusVariantBuilder().build(testResources);
		const expected = await captureStageCorpus("build", instructions, [source]);
		const run = await new ReplaySavedRunBuilder({
			discussCorpus: await captureStageCorpus("discuss", instructions, [
				source,
			]),
		}).build(testResources);
		const fake = new ReplayConfirmationHarness();

		const outcome = await runReplay(
			{
				...fake.dependencies,
				installStageCorpusSnapshot,
				stageSession: { ...fake.dependencies.stageSession, captureStageCorpus },
			},
			{
				...new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
				corpusSource: source,
				instructions,
			},
		);

		expect(outcome.record.corpusFiles).toEqual(expected);
		expect(outcome.record.staleness).toEqual([]);
	};
const leavesTheSetupUnsetWhenNoCorpusIsGiven = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder().build(testResources);
	const fake = new ReplayConfirmationHarness();

	await runReplay(
		fake.dependencies,
		new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
	);

	expect(fake.stageSetups).toEqual([undefined]);
};
describe(runReplay.name, () => {
	describe("corpus and settings", () => {
		it(
			"runs the stage with the actual setup when given a corpus",
			runsTheStageWithTheActualSetupWhenGiven,
		);
		it(
			"passes a declared settings overlay through to the stage session",
			passesADeclaredSettingsOverlayThroughToTheStage,
		);
		it(
			"leaves the settings overlay unset when none is given",
			leavesTheSettingsOverlayUnsetWhenNoneIsGiven,
		);
		it(
			"installs the corpus snapshot into the worktree before the stage runs",
			installsTheCorpusSnapshotIntoTheWorktreeBeforeThe,
		);
		it(
			"replays a linked directory variant with the captured paths and hashes",
			replaysALinkedDirectoryVariantWithTheCapturedPaths,
		);
		it(
			"leaves the setup unset when no corpus is given",
			leavesTheSetupUnsetWhenNoCorpusIsGiven,
		);
	});
});
