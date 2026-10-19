import { afterEach, describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";
import { join } from "node:path";

import { readCorpusUnderTest } from "#benchmark/corpus-version";
import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { pipelineRun } from "#server/history-record-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	fixtureRecordingLiveSettings,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { recordStaleness, runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

const HASH_INVOCATION_COUNT_INCREMENT = 1;

describe("history corpus confinement", () => {
	it(
		"hashes the corpus under test once to judge every record's staleness",
		verifyHashesTheCorpusUnderTestOnceToJudgeEvery,
	);

	describe(
		"when a corpus directory holds a symlink out of the tree",
		registerHistoryCorpusConfinementWhenACorpusDirectoryHoldsASymlinkOutOfTheTree,
	);
});

async function verifyHashesTheCorpusUnderTestOnceToJudgeEvery(): Promise<void> {
	const expectedHashes = 1;

	const fixture = await fixtureRecordingLiveSettings();
	const corpus = await corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await fixture.corpus.recordReplayFrom(directorySource(corpus));
	let hashes = 0;

	await recordStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
		async (recordsDirectory, source) => {
			hashes += HASH_INVOCATION_COUNT_INCREMENT;

			return await readCorpusUnderTest(recordsDirectory, source);
		},
	);

	expect(hashes).toBe(expectedHashes);
}

async function verifyRendersEveryRowItCouldReadRatherThanFailing(): Promise<void> {
	const fixture = await writtenFixture();
	const corpus = await corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await symlink(
		join(corpus, "CLAUDE.md"),
		join(corpus, "skills", "build", "escape.md"),
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(corpus),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.replayableRun)).toBeDefined();
}

async function verifyMarksTheRowStaleNamingTheEntryThatCould(): Promise<void> {
	const fixture = await fixtureRecordingLiveSettings();
	const corpus = await corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await symlink(
		join(corpus, "CLAUDE.md"),
		join(corpus, "skills", "build", "escape.md"),
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(corpus),
		},
		nothingRunning,
	);

	const row = pipelineRun(rows, fixture.replayableRun);
	expect(row?.staleness).toMatchObject({ stale: true, state: "available" });
	expect(JSON.stringify(row?.staleness)).toContain("skills/build/escape.md");
}

async function verifyNamesNoAbsoluteFilesystemPathInTheRowS(): Promise<void> {
	const fixture = await writtenFixture();
	const corpus = await corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await symlink(
		join(corpus, "CLAUDE.md"),
		join(corpus, "skills", "build", "escape.md"),
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(corpus),
		},
		nothingRunning,
	);

	expect(
		rows.map((row) => JSON.stringify(row.staleness)).join(" "),
	).not.toContain(corpus);
}

function registerHistoryCorpusConfinementWhenACorpusDirectoryHoldsASymlinkOutOfTheTree(): void {
	it(
		"renders every row it could read rather than failing the report",
		verifyRendersEveryRowItCouldReadRatherThanFailing,
	);

	it(
		"marks the row stale, naming the entry that could not be hashed",
		verifyMarksTheRowStaleNamingTheEntryThatCould,
	);

	it(
		"names no absolute filesystem path in the row's causes",
		verifyNamesNoAbsoluteFilesystemPathInTheRowS,
	);
}
