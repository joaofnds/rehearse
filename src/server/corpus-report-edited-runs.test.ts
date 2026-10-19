import { afterEach, describe, expect, it } from "bun:test";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { benchmarkRunPaths, checkpointRecordFile } from "#benchmark/run-layout";
import {
	RecordedRunsFixture,
	directorySource,
	liveStageSettings,
} from "#benchmark/run-records-test-support";
import {
	clearCorpusReportRoots,
	fullCorpusDirectory,
	recordedCorpusHistory,
	runsDirectory,
} from "#server/corpus-report-workspace-test-fixture";

import type { CorpusReport } from "./corpus-report";
import { corpusReport } from "./corpus-report";

afterEach(clearCorpusReportRoots);

async function editedAfterRun(): Promise<{
	readonly report: CorpusReport;
	readonly fixture: RecordedRunsFixture;
	readonly previous: string;
}> {
	const corpus = await fullCorpusDirectory();
	const runs = await runsDirectory();
	const fixture = new RecordedRunsFixture(runs, {
		settingsFile: await liveStageSettings(),
	});
	await fixture.write();
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	const measured = await fixture.corpus.recordVersionFrom(
		directorySource(corpus),
	);
	await writeFile(
		join(corpus, "skills", "build", "SKILL.md"),
		"build skill, edited\n",
	);

	const report = await corpusReport(directorySource(corpus), runs);

	return {
		fixture,
		previous: measured.kind === "version" ? measured.digest : "refused",
		report,
	};
}

describe(corpusReport.name, () => {
	describe("when the corpus was edited after a run read it", () => {
		it(
			"counts the run's row as invalidated by the last edit, by its id",
			verifyCountsTheRunSRowAsInvalidatedByThe,
		);

		it(
			"counts a stopped run's row as invalidated when the stage its judge stopped read the edited file",
			verifyCountsAStoppedRunSRowAsInvalidatedWhen,
		);

		it(
			"leaves a run's row uncounted when a stage record it keeps does not parse, rather than judging it by its checkpoint",
			verifyLeavesARunSRowUncountedWhenAStage,
		);

		it(
			"counts the row against the edited file and not against a file the edit left alone",
			verifyCountsTheRowAgainstTheEditedFileAndNot,
		);

		it(
			"counts the readable rows when another run's manifest does not parse, rather than failing the report",
			verifyCountsTheReadableRowsWhenAnotherRunSManifest,
		);

		it(
			"leaves out a run already stale for its stage settings",
			verifyLeavesOutARunAlreadyStaleForItsStage,
		);

		it(
			"leaves out a run whose latest checkpoint directory holds no record, since its history row has no judgment",
			verifyLeavesOutARunWhoseLatestCheckpointDirectoryHolds,
		);

		it(
			"counts a run judged by its latest checkpoint when an earlier one holds no record",
			verifyCountsARunJudgedByItsLatestCheckpointWhen,
		);
	});
});

async function verifyCountsTheRunSRowAsInvalidatedByThe(): Promise<void> {
	const { report, fixture, previous } = await editedAfterRun();

	expect(report.lastEdit).toEqual({
		count: 1,
		current: report.digest ?? "refused",
		kind: "measured",
		previous,
		rows: [`run:${fixture.replayableRun}`],
	});
}

async function verifyCountsAStoppedRunSRowAsInvalidatedWhen(): Promise<void> {
	const corpus = await fullCorpusDirectory();
	const runs = await runsDirectory();
	const fixture = new RecordedRunsFixture(runs, {
		settingsFile: await liveStageSettings(),
	});
	await fixture.stopped.writeStoppedRun();
	await fixture.corpus.recordStoppedStageFrom(directorySource(corpus));
	await writeFile(
		join(corpus, "skills", "build", "SKILL.md"),
		"build skill, edited\n",
	);

	const report = await corpusReport(directorySource(corpus), runs);

	expect(report.lastEdit).toMatchObject({
		count: 1,
		kind: "measured",
		rows: [`run:${fixture.stoppedRun}`],
	});
	expect(
		report.files.find(({ path }) => path === "skills/build/SKILL.md"),
	).toMatchObject({ invalidated: 1, readBy: 1 });
}

async function verifyLeavesARunSRowUncountedWhenAStage(): Promise<void> {
	const corpus = await fullCorpusDirectory();
	const runs = await runsDirectory();
	const fixture = await recordedCorpusHistory(corpus, runs);
	await writeFile(
		benchmarkRunPaths(runs, fixture.replayableRun).stageFile("aaa"),
		'{"status": "AWAIT',
	);
	await writeFile(
		join(corpus, "skills", "build", "SKILL.md"),
		"build skill, edited\n",
	);

	const report = await corpusReport(directorySource(corpus), runs);

	expect(report.lastEdit).toMatchObject({
		count: 0,
		kind: "measured",
		rows: [],
	});
}

async function verifyCountsTheRowAgainstTheEditedFileAndNot(): Promise<void> {
	const { report } = await editedAfterRun();

	const counts = Object.fromEntries(
		report.files.map(({ path, invalidated }) => [path, invalidated]),
	);
	expect(counts).toEqual({
		"CLAUDE.md": 0,
		"skills/build/SKILL.md": 1,
		"skills/discuss/SKILL.md": 0,
	});
}

async function verifyCountsTheReadableRowsWhenAnotherRunSManifest(): Promise<void> {
	const corpus = await fullCorpusDirectory();
	const runs = await runsDirectory();
	const fixture = await recordedCorpusHistory(corpus, runs);
	const brokenRun = "2026-09-12T00-00-00.000Z";
	await fixture.pipeline.writePipelineRun({
		caseId: "audit-log",
		run: brokenRun,
	});
	await writeFile(
		benchmarkRunPaths(runs, brokenRun).manifestFile,
		"{ not json",
	);
	await writeFile(
		join(corpus, "skills", "build", "SKILL.md"),
		"build skill, edited\n",
	);

	const report = await corpusReport(directorySource(corpus), runs);

	expect(report.lastEdit).toMatchObject({
		kind: "measured",
		rows: [`run:${fixture.replayableRun}`],
	});
}

async function verifyLeavesOutARunAlreadyStaleForItsStage(): Promise<void> {
	const corpus = await fullCorpusDirectory();
	const runs = await runsDirectory();
	const fixture = new RecordedRunsFixture(runs);
	await fixture.write();
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await fixture.corpus.recordVersionFrom(directorySource(corpus));
	await writeFile(
		join(corpus, "skills", "build", "SKILL.md"),
		"build skill, edited\n",
	);

	const report = await corpusReport(directorySource(corpus), runs);

	expect(report.lastEdit).toMatchObject({ kind: "measured", rows: [] });
}

async function verifyLeavesOutARunWhoseLatestCheckpointDirectoryHolds(): Promise<void> {
	const corpus = await fullCorpusDirectory();
	const runs = await runsDirectory();
	const fixture = await recordedCorpusHistory(corpus, runs);
	await rm(
		checkpointRecordFile(
			benchmarkRunPaths(runs, fixture.replayableRun).checkpointDirectory(
				"build",
			),
		),
	);
	await writeFile(
		join(corpus, "skills", "discuss", "SKILL.md"),
		"discuss skill, edited\n",
	);

	const report = await corpusReport(directorySource(corpus), runs);

	expect(report.lastEdit).toMatchObject({ kind: "measured", rows: [] });
}

async function verifyCountsARunJudgedByItsLatestCheckpointWhen(): Promise<void> {
	const corpus = await fullCorpusDirectory();
	const runs = await runsDirectory();
	const fixture = await recordedCorpusHistory(corpus, runs);
	await rm(
		checkpointRecordFile(
			benchmarkRunPaths(runs, fixture.replayableRun).checkpointDirectory(
				"discuss",
			),
		),
	);
	await writeFile(
		join(corpus, "skills", "build", "SKILL.md"),
		"build skill, edited\n",
	);

	const report = await corpusReport(directorySource(corpus), runs);

	expect(report.lastEdit).toMatchObject({
		kind: "measured",
		rows: [`run:${fixture.replayableRun}`],
	});
}
