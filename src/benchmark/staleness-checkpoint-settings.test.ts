import { afterEach, describe, expect, it } from "bun:test";

import { CONTROL_DIR } from "./config";
import { directorySource } from "./run-records-test-support";
import CheckpointCorpusFixtures from "./staleness-checkpoint-test-fixtures";
import { staleCheckpoints } from "./staleness-report";

const SHA256_HEX_DIGITS = 64;

const FIRST_STALENESS_RESULT_INDEX = 0;

const fixtures = new CheckpointCorpusFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function stalesTheInitialCheckpointAndItsDownstreamChainWhenSettingsChange(): Promise<void> {
	const fixture = await fixtures.writtenFixture();
	const corpus = await fixtures.corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await fixture.pipeline.recordSettingsFile({
		path: "stage-settings.json",
		sha256: "0".repeat(SHA256_HEX_DIGITS),
	});

	const stale = await staleCheckpoints(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(stale.map(({ id, causes }) => ({ causes, id }))).toEqual([
		{
			causes: ["stage settings file stage-settings.json changed"],
			id: `checkpoint:${fixture.replayableRun}/initial`,
		},
		{
			causes: [
				"upstream stage initial is stale",
				"stage settings file stage-settings.json changed",
			],
			id: `checkpoint:${fixture.replayableRun}/discuss`,
		},
		{
			causes: [
				"upstream stage initial is stale",
				"stage settings file stage-settings.json changed",
			],
			id: `checkpoint:${fixture.replayableRun}/build`,
		},
	]);
}

async function treatsCheckpointsWithoutSettingsEvidenceAsStale(): Promise<void> {
	const fixture = await fixtures.writtenFixture();
	const corpus = await fixtures.corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await fixture.pipeline.recordSettingsFile();

	const stale = await staleCheckpoints(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(stale.map(({ id }) => id)).toEqual([
		`checkpoint:${fixture.replayableRun}/initial`,
		`checkpoint:${fixture.replayableRun}/discuss`,
		`checkpoint:${fixture.replayableRun}/build`,
	]);
}

async function keepsHealthyRunsReadableWhenAnotherRunSSettingsFileIsMissing(): Promise<void> {
	const fixture = await fixtures.writtenFixture();
	const corpus = await fixtures.corpusDirectory("build skill\n");
	const brokenRun = "2026-09-07T00-00-00.000Z";
	const caseId = "zz-settings-missing";
	await fixtures.settingsRun({ caseId, corpus, fixture, run: brokenRun });

	const stale = await staleCheckpoints(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(stale.map(({ id }) => id)).toEqual([
		`checkpoint:${brokenRun}/discuss`,
		`checkpoint:${brokenRun}/build`,
	]);
	expect(stale.at(FIRST_STALENESS_RESULT_INDEX)?.causes.join(" ")).toContain(
		`cases/${caseId}/settings.json`,
	);
	expect(stale.flatMap(({ causes }) => causes).join(" ")).not.toContain(
		CONTROL_DIR,
	);
}

async function keepsHealthyRunsReadableWhenAnotherRunSSettingsFileIsInvalid(): Promise<void> {
	const fixture = await fixtures.writtenFixture();
	const corpus = await fixtures.corpusDirectory("build skill\n");
	const brokenRun = "2026-09-08T00-00-00.000Z";
	const caseId = "zz-settings-invalid";
	await fixtures.settingsRun({
		caseId,
		corpus,
		fixture,
		run: brokenRun,
		settingsContent: JSON.stringify({ hooks: {} }),
	});

	const stale = await staleCheckpoints(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(stale.map(({ id }) => id)).toEqual([
		`checkpoint:${brokenRun}/discuss`,
		`checkpoint:${brokenRun}/build`,
	]);
	expect(stale.at(FIRST_STALENESS_RESULT_INDEX)?.causes.join(" ")).toContain(
		`cases/${caseId}/settings.json`,
	);
}

describe(staleCheckpoints.name, () => {
	it(
		"stales the initial checkpoint and its downstream chain when settings change",
		stalesTheInitialCheckpointAndItsDownstreamChainWhenSettingsChange,
	);
	it(
		"treats checkpoints without settings evidence as stale",
		treatsCheckpointsWithoutSettingsEvidenceAsStale,
	);
	it(
		"keeps healthy runs readable when another run's settings file is missing",
		keepsHealthyRunsReadableWhenAnotherRunSSettingsFileIsMissing,
	);
	it(
		"keeps healthy runs readable when another run's settings file is invalid",
		keepsHealthyRunsReadableWhenAnotherRunSSettingsFileIsInvalid,
	);
});
