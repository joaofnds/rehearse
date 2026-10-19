import { afterEach, describe, expect, it } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	RecordedRunsFixture,
	directorySource,
} from "#benchmark/run-records-test-support";
import {
	clearCorpusReportRoots,
	corpusDirectory,
	fullCorpusDirectory,
	runsDirectory,
} from "#server/corpus-report-workspace-test-fixture";

import { corpusReport } from "./corpus-report";

afterEach(clearCorpusReportRoots);

describe(corpusReport.name, () => {
	it(
		"lists a live corpus file with a read count of zero when no checkpoint recorded it",
		verifyListsALiveCorpusFileWithAReadCount,
	);

	it(
		"counts the run once when two of its stages both recorded the same file, since read-by counts distinct rows",
		verifyCountsTheRunOnceWhenTwoOfItsStages,
	);

	it(
		"reports a run whose checkpoint directory holds no checkpoint.json as read-by zero, rather than throwing",
		verifyReportsARunWhoseCheckpointDirectoryHoldsNoCheckpoint,
	);
});

async function verifyListsALiveCorpusFileWithAReadCount(): Promise<void> {
	const corpus = await corpusDirectory();
	await writeFile(join(corpus, "CLAUDE.md"), "instructions");

	const report = await corpusReport(
		directorySource(corpus),
		await runsDirectory(),
	);

	expect(report.files).toEqual([
		expect.objectContaining({ path: "CLAUDE.md", readBy: 0 }),
	]);
}

async function verifyCountsTheRunOnceWhenTwoOfItsStages(): Promise<void> {
	const corpus = await fullCorpusDirectory();
	const runs = await runsDirectory();

	const fixture = new RecordedRunsFixture(runs);
	await fixture.write();
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));

	const report = await corpusReport(directorySource(corpus), runs);

	const instructions = report.files.find((file) => file.path === "CLAUDE.md");
	expect(instructions).toMatchObject({ readBy: 1 });
}

async function verifyReportsARunWhoseCheckpointDirectoryHoldsNoCheckpoint(): Promise<void> {
	const corpus = await corpusDirectory();
	await writeFile(join(corpus, "CLAUDE.md"), "instructions");
	const runs = await runsDirectory();
	const fixture = new RecordedRunsFixture(runs);
	await fixture.pipeline.writeEmptyCheckpointDirectory("discuss");

	const report = await corpusReport(directorySource(corpus), runs);

	const instructions = report.files.find((file) => file.path === "CLAUDE.md");
	expect(instructions).toMatchObject({ readBy: 0 });
}
