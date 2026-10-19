import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { z } from "zod";

import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import { benchmarkRunPaths, checkpointRecordFile } from "#benchmark/run-layout";
import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";
import {
	pipelineRun,
	recordCorpusVersion,
} from "#server/history-record-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	fixtureRecordingLiveSettings,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

describe(runHistoryReport.name, () => {
	describe("when a stopped stage recorded a corpus version", () => {
		it(
			"shows the version a stopped stage's record names and says the corpus changed when an earlier stage measured another",
			verifyShowsTheVersionAStoppedStageSRecordNames,
		);

		it(
			"judges a stopped run's row by the stage its judge stopped, at that stage's version distance",
			verifyJudgesAStoppedRunSRowByTheStage,
		);
	});

	describe("when the corpus measurement was refused", () => {
		it(
			"does not call a refused measurement a corpus change",
			verifyDoesNotCallARefusedMeasurementACorpusChange,
		);
	});

	describe("when the stop record cannot be parsed", () => {
		it(
			"reads a stopped run's row as unavailable when its stop record does not parse, rather than clean by its checkpoint",
			verifyReadsAStoppedRunSRowAsUnavailableWhen,
		);
	});

	describe("when the run and stage have corpus measurements", () => {
		it(
			"names the corpus version a run recorded at its start while none of its stages has measured one",
			verifyNamesTheCorpusVersionARunRecordedAtIts,
		);

		it(
			"names a stage's own corpus version over the one its run recorded at its start",
			verifyNamesAStageSOwnCorpusVersionOverThe,
		);
	});

	describe("when only the initial checkpoint is recorded", () => {
		it(
			"reports staleness from a stopped run's initial checkpoint",
			verifyReportsStalenessFromAStoppedRunSInitialCheckpoint,
		);
	});
});

async function verifyShowsTheVersionAStoppedStageSRecordNames(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.stopped.writeStoppedRun();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.stoppedRun);
	const stopped: CorpusMeasurement = {
		digest: "b".repeat(SHA256_HEX_DIGITS),
		kind: "version",
	};
	await recordCorpusVersion(paths.stageFile("discuss"), {
		digest: "a".repeat(SHA256_HEX_DIGITS),
		kind: "version",
	});
	await recordCorpusVersion(paths.stageFile("build"), stopped);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.stoppedRun)).toMatchObject({
		corpusChangedDuringRun: true,
		corpusVersion: stopped,
	});
}

async function verifyDoesNotCallARefusedMeasurementACorpusChange(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.stopped.writeStoppedRun();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.stoppedRun);
	const refused: CorpusMeasurement = {
		kind: "refused",
		refusal: "a symlink escapes the root",
	};
	await recordCorpusVersion(paths.stageFile("discuss"), {
		digest: "a".repeat(SHA256_HEX_DIGITS),
		kind: "version",
	});
	await recordCorpusVersion(paths.stageFile("build"), refused);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.stoppedRun)).toMatchObject({
		corpusChangedDuringRun: false,
		corpusVersion: refused,
	});
}

async function verifyJudgesAStoppedRunSRowByTheStage(): Promise<void> {
	const fixture = await fixtureRecordingLiveSettings();
	await fixture.stopped.writeStoppedRun();
	const corpus = await corpusDirectory("build skill\n");
	await fixture.corpus.recordStoppedStageFrom(directorySource(corpus));
	await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");

	const { rows } = await runHistoryReport(
		{ runsDirectory: fixture.runsDirectory, source: directorySource(corpus) },
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.stoppedRun)?.staleness).toMatchObject({
		causes: ["skills/build/SKILL.md changed"],
		distance: { kind: "measured", versions: 1 },
		stale: true,
		state: "available",
	});
}

async function verifyReadsAStoppedRunSRowAsUnavailableWhen(): Promise<void> {
	const fixture = await fixtureRecordingLiveSettings();
	await fixture.stopped.writeStoppedRun();
	const corpus = await corpusDirectory("build skill\n");
	await fixture.corpus.recordStoppedStageFrom(directorySource(corpus));
	const stopRecord = benchmarkRunPaths(
		fixture.runsDirectory,
		fixture.stoppedRun,
	).stageFile("build");
	const stoppedStageRecord = z
		.looseObject({})
		.parse(await Bun.file(stopRecord).json());
	await Bun.write(
		stopRecord,
		JSON.stringify({
			...stoppedStageRecord,
			corpusVersion: { digest: "not a digest", kind: "version" },
		}),
	);

	const { rows } = await runHistoryReport(
		{ runsDirectory: fixture.runsDirectory, source: directorySource(corpus) },
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.stoppedRun)?.staleness).toMatchObject({
		state: "unavailable",
	});
}

async function verifyNamesTheCorpusVersionARunRecordedAtIts(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.stopped.writeStoppedRun();
	const started: CorpusMeasurement = {
		digest: "c".repeat(SHA256_HEX_DIGITS),
		kind: "version",
	};
	await recordCorpusVersion(
		benchmarkRunPaths(fixture.runsDirectory, fixture.stoppedRun).manifestFile,
		started,
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.stoppedRun)?.corpusVersion).toEqual(started);
}

async function verifyNamesAStageSOwnCorpusVersionOverThe(): Promise<void> {
	const fixture = await writtenFixture();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.replayableRun);
	const measured: CorpusMeasurement = {
		digest: "d".repeat(SHA256_HEX_DIGITS),
		kind: "version",
	};
	await recordCorpusVersion(paths.manifestFile, {
		digest: "c".repeat(SHA256_HEX_DIGITS),
		kind: "version",
	});
	await Array.fromAsync(fixture.stages, async (stage) => {
		await recordCorpusVersion(
			checkpointRecordFile(paths.checkpointDirectory(stage)),
			measured,
		);
	});

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.replayableRun)).toMatchObject({
		corpusChangedDuringRun: false,
		corpusVersion: measured,
	});
}

async function verifyReportsStalenessFromAStoppedRunSInitialCheckpoint(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.stopped.writeStoppedRun();
	await fixture.pipeline.writeInitialCheckpoint(fixture.stoppedRun, {
		path: "stage-settings.json",
		sha256: "0".repeat(SHA256_HEX_DIGITS),
	});

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	const row = pipelineRun(rows, fixture.stoppedRun);
	expect(row).toMatchObject({
		caseId: "audit-log",
		checkpoints: [],
		corpusVersion: undefined,
		grade: undefined,
		kind: "run",
		links: [
			{
				href: `/runs/${fixture.stoppedRun}/stages/build`,
				label: "build",
				state: "available",
			},
		],
		progress: { state: "recorded" },
		run: fixture.stoppedRun,
		shortId: undefined,
		stage: undefined,
		staleness: {
			causes: ["stage settings file stage-settings.json changed"],
			stale: true,
			state: "available",
		},
		status: "STOPPED:build",
	});
}
