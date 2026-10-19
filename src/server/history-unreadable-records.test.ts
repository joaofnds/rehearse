import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONTROL_DIR } from "#benchmark/config";
import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { pipelineRun } from "#server/history-record-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	roots,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

const EXPECTED_UNREADABLE_RECORD_COUNT = 1;

afterEach(clearHistoryRoots);

const FIRST_UNREADABLE_RECORD_INDEX = 0;

describe("history unreadable records", () => {
	it(
		"collects a run stopped mid-stage with no manifest as unreadable, matching list runs, rather than dropping it silently",
		verifyCollectsARunStoppedMidStageWithNoManifest,
	);

	it(
		"names a run directory with no manifest and no events as unreadable, since nothing records what it ran",
		verifyNamesARunDirectoryWithNoManifestAndNo,
	);

	it(
		"names a run with a manifest but no stage record and no events as unreadable, matching list runs' no record",
		verifyNamesARunWithAManifestButNoStage,
	);

	it(
		"names a run that recorded run-completed without its artifact as unreadable",
		verifyNamesARunThatRecordedRunCompletedWithoutIts,
	);

	it(
		"reads an empty runs directory as no rows, not an error",
		verifyReadsAnEmptyRunsDirectoryAsNoRowsNot,
	);

	it(
		"collects a run whose artifact fails to parse as unreadable, without dropping the other rows",
		verifyCollectsARunWhoseArtifactFailsToParseAs,
	);

	it(
		"names no absolute filesystem path in an unreadable run's reason",
		verifyNamesNoAbsoluteFilesystemPathInAnUnreadableRun,
	);
});

async function verifyCollectsARunStoppedMidStageWithNoManifest(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.stopped.writeStoppedRunWithoutManifest();

	const { rows, unreadable } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.stoppedRun) !== undefined).toBe(false);
	expect(
		unreadable.some((entry) => entry.id === `run:${fixture.stoppedRun}`),
	).toBe(true);
}

async function verifyNamesARunDirectoryWithNoManifestAndNo(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.pipeline.writeEmptyRunDirectory("any-name-1");

	const { rows, unreadable } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, "any-name-1")).toBeUndefined();
	expect(unreadable).toContainEqual({
		id: "run:any-name-1",
		kind: "run",
		reason: "no manifest recorded",
	});
}

async function verifyNamesARunWithAManifestButNoStage(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeNoRecordRun();

	const { rows, unreadable } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.noRecordRun)).toBeUndefined();
	expect(unreadable).toContainEqual({
		id: `run:${fixture.noRecordRun}`,
		kind: "run",
		reason: "no record: no stage record and no run events",
	});
}

async function verifyNamesARunThatRecordedRunCompletedWithoutIts(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeCompletedRunWithoutArtifact();

	const { rows, unreadable } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.unrecordedArtifactRun)).toBeUndefined();
	expect(unreadable).toContainEqual({
		id: `run:${fixture.unrecordedArtifactRun}`,
		kind: "run",
		reason: "incomplete: the run recorded run-completed but no artifact",
	});
}

async function verifyReadsAnEmptyRunsDirectoryAsNoRowsNot(): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-run-history-empty-"));
	roots.push(root);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: root,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(rows).toEqual([]);
}

async function verifyCollectsARunWhoseArtifactFailsToParseAs(): Promise<void> {
	const fixture = await writtenFixture();
	const corpus = await corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await writeFile(
		join(fixture.runsDirectory, `${fixture.replayableRun}.json`),
		"{ not json\n",
	);

	const { rows, unreadable } = await runHistoryReport(
		{ runsDirectory: fixture.runsDirectory, source: directorySource(corpus) },
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.replayableRun) !== undefined).toBe(false);
	expect(pipelineRun(rows, fixture.unreplayableRun) !== undefined).toBe(true);
	expect(unreadable).toHaveLength(EXPECTED_UNREADABLE_RECORD_COUNT);
	expect(unreadable.at(FIRST_UNREADABLE_RECORD_INDEX)?.id).toBe(
		`run:${fixture.replayableRun}`,
	);
	expect(unreadable.at(FIRST_UNREADABLE_RECORD_INDEX)?.reason).not.toBeEmpty();
}

async function verifyNamesNoAbsoluteFilesystemPathInAnUnreadableRun(): Promise<void> {
	const fixture = await writtenFixture();
	const corpus = await corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await writeFile(
		join(fixture.runsDirectory, `${fixture.replayableRun}.json`),
		"{ not json\n",
	);

	const { unreadable } = await runHistoryReport(
		{ runsDirectory: fixture.runsDirectory, source: directorySource(corpus) },
		nothingRunning,
	);

	const reason = unreadable.at(FIRST_UNREADABLE_RECORD_INDEX)?.reason ?? "";
	expect(reason).not.toContain(CONTROL_DIR);
	expect(reason).not.toMatch(/\/(?<segment>Users|home|var|tmp)\//u);
}
