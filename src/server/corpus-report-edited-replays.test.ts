import { afterEach, describe, expect, it } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { measureCorpusVersion } from "#benchmark/corpus-version";
import { directorySource } from "#benchmark/run-records-test-support";
import {
	clearCorpusReportRoots,
	fullCorpusDirectory,
	recordedCorpusHistory,
	runsDirectory,
} from "#server/corpus-report-workspace-test-fixture";

import { corpusReport } from "./corpus-report";

afterEach(clearCorpusReportRoots);

describe(corpusReport.name, () => {
	describe("when the corpus was edited after a run read it", () => {
		it(
			"leaves out a replay whose upstream stage an earlier edit had already made stale",
			verifyLeavesOutAReplayWhoseUpstreamStageAnEarlier,
		);

		it(
			"counts a replay the last edit made stale through its upstream stage",
			verifyCountsAReplayTheLastEditMadeStaleThrough,
		);

		it(
			"leaves out a row an earlier edit had already made stale",
			verifyLeavesOutARowAnEarlierEditHadAlready,
		);
	});
});

async function verifyLeavesOutAReplayWhoseUpstreamStageAnEarlier(): Promise<void> {
	const corpus = await fullCorpusDirectory();
	const runs = await runsDirectory();
	const fixture = await recordedCorpusHistory(corpus, runs);
	await writeFile(
		join(corpus, "skills", "discuss", "SKILL.md"),
		"discuss skill, edited\n",
	);
	await fixture.corpus.recordReplayFrom(directorySource(corpus));
	await writeFile(
		join(corpus, "skills", "build", "SKILL.md"),
		"build skill, edited\n",
	);

	const report = await corpusReport(directorySource(corpus), runs);

	expect(report.lastEdit).toMatchObject({ kind: "measured", rows: [] });
}

async function verifyCountsAReplayTheLastEditMadeStaleThrough(): Promise<void> {
	const corpus = await fullCorpusDirectory();
	const runs = await runsDirectory();
	const fixture = await recordedCorpusHistory(corpus, runs);
	await fixture.corpus.recordReplayFrom(directorySource(corpus));
	await writeFile(
		join(corpus, "skills", "discuss", "SKILL.md"),
		"discuss skill, edited\n",
	);

	const report = await corpusReport(directorySource(corpus), runs);

	expect(report.lastEdit).toMatchObject({
		kind: "measured",
		rows: [
			`attempt:stage:${fixture.stageAttempt.lineage}/${fixture.stageAttempt.timestamp}`,
			`run:${fixture.replayableRun}`,
		],
	});
}

async function verifyLeavesOutARowAnEarlierEditHadAlready(): Promise<void> {
	const corpus = await fullCorpusDirectory();
	const runs = await runsDirectory();
	await recordedCorpusHistory(corpus, runs);
	await writeFile(
		join(corpus, "skills", "build", "SKILL.md"),
		"build skill, edited\n",
	);
	await measureCorpusVersion(runs, directorySource(corpus));
	await writeFile(
		join(corpus, "skills", "discuss", "SKILL.md"),
		"discuss skill, edited\n",
	);

	const report = await corpusReport(directorySource(corpus), runs);

	expect(report.lastEdit).toMatchObject({ count: 0, kind: "measured" });
}
