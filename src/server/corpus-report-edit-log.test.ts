import { afterEach, describe, expect, it } from "bun:test";
import { rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { measureCorpusVersion } from "#benchmark/corpus-version";
import {
	RecordedRunsFixture,
	directorySource,
	liveStageSettings,
} from "#benchmark/run-records-test-support";
import {
	clearCorpusReportRoots,
	fullCorpusDirectory,
	runsDirectory,
} from "#server/corpus-report-workspace-test-fixture";

import { corpusReport } from "./corpus-report";

const NO_INVALIDATED_RUNS = 0;

afterEach(clearCorpusReportRoots);

describe(corpusReport.name, () => {
	describe("when the corpus was edited after a run read it", () => {
		it(
			"reads the last edit as not recorded when the previous version's files are gone from the store",
			verifyReadsTheLastEditAsNotRecordedWhenThe,
		);

		it(
			"names a refused corpus under test as the reason the last edit is not recorded",
			verifyNamesARefusedCorpusUnderTestAsTheReason,
		);

		it(
			"reads the last edit as not recorded when the log holds no earlier version",
			verifyReadsTheLastEditAsNotRecordedWhenTheLog,
		);
	});
});

async function verifyReadsTheLastEditAsNotRecordedWhenThe(): Promise<void> {
	const corpus = await fullCorpusDirectory();
	const runs = await runsDirectory();
	await measureCorpusVersion(runs, directorySource(corpus));
	await rm(join(runs, "corpus-versions", "blobs"), {
		recursive: true,
	});
	await writeFile(
		join(corpus, "skills", "build", "SKILL.md"),
		"build skill, edited\n",
	);

	const report = await corpusReport(directorySource(corpus), runs);

	expect(
		report.lastEdit.kind === "not-recorded" && report.lastEdit.reason,
	).toContain("cannot be read");
}

async function verifyNamesARefusedCorpusUnderTestAsTheReason(): Promise<void> {
	const corpus = await fullCorpusDirectory();
	const runs = await runsDirectory();
	await measureCorpusVersion(runs, directorySource(corpus));
	await writeFile(
		join(corpus, "skills", "build", "SKILL.md"),
		"build skill, edited\n",
	);
	await measureCorpusVersion(runs, directorySource(corpus));
	await symlink(join(corpus, "skills", "loop"), join(corpus, "skills", "loop"));

	const report = await corpusReport(directorySource(corpus), runs);

	expect(report.lastEdit).toEqual({
		kind: "not-recorded",
		reason:
			"the corpus under test refused hashing, so it has no place in its log",
	});
}

async function verifyReadsTheLastEditAsNotRecordedWhenTheLog(): Promise<void> {
	const corpus = await fullCorpusDirectory();
	const runs = await runsDirectory();
	const fixture = new RecordedRunsFixture(runs, {
		settingsFile: await liveStageSettings(),
	});
	await fixture.write();
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await writeFile(
		join(corpus, "skills", "build", "SKILL.md"),
		"build skill, edited\n",
	);

	const report = await corpusReport(directorySource(corpus), runs);

	expect(report.lastEdit.kind).toBe("not-recorded");
	expect(report.files.map(({ invalidated }) => invalidated)).toEqual([
		NO_INVALIDATED_RUNS,
		NO_INVALIDATED_RUNS,
		NO_INVALIDATED_RUNS,
	]);
}
