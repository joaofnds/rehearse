import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { pipelineRun } from "#server/history-record-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	fixtureRecordingLiveSettings,
	versionedHistoryFixture,
} from "#server/history-workspace-test-fixture";

import type { RowStaleness } from "./run-history";
import { UNJUDGED_REASON, runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

describe("history corpus staleness", () => {
	it(
		"marks a row stale when its latest checkpoint's corpus no longer matches",
		verifyMarksARowStaleWhenItsLatestCheckpointS,
	);

	it(
		"gives every kind of row the files it read that changed and its version distance",
		verifyGivesEveryKindOfRowTheFilesItRead,
	);

	it(
		"counts a row stale only from corpus files when its upstream stage went stale from the same edit",
		verifyCountsARowStaleOnlyFromCorpusFilesWhen,
	);

	it(
		"says why a row's staleness could not be judged rather than calling it clean",
		verifySaysWhyARowSStalenessCouldNotBe,
	);

	it(
		"names no absolute filesystem path in why a row's staleness could not be judged",
		verifyNamesNoAbsoluteFilesystemPathInWhyARow,
	);

	it(
		"marks a row clean when its latest checkpoint's corpus still matches",
		verifyMarksARowCleanWhenItsLatestCheckpointS,
	);
});

async function verifyMarksARowStaleWhenItsLatestCheckpointS(): Promise<void> {
	const fixture = await fixtureRecordingLiveSettings();
	const recorded = await corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(recorded));
	const edited = await corpusDirectory("build skill, edited\n");

	const { rows } = await runHistoryReport(
		{ runsDirectory: fixture.runsDirectory, source: directorySource(edited) },
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.replayableRun)?.staleness).toMatchObject({
		causes: ["skills/build/SKILL.md changed"],
		stale: true,
		state: "available",
	});
}

async function verifyGivesEveryKindOfRowTheFilesItRead(): Promise<void> {
	const { fixture, corpus } = await versionedHistoryFixture();
	await Bun.write(
		join(corpus, "skills", "build", "SKILL.md"),
		"build skill, edited\n",
	);

	const { rows } = await runHistoryReport(
		{ runsDirectory: fixture.runsDirectory, source: directorySource(corpus) },
		nothingRunning,
	);

	const edited: RowStaleness = {
		causes: ["skills/build/SKILL.md changed"],
		changedFiles: [{ change: "changed", path: "skills/build/SKILL.md" }],
		distance: { kind: "measured", versions: 1 },
		onlyCorpusFiles: true,
		stale: true,
		state: "available",
	};
	expect(pipelineRun(rows, fixture.replayableRun)?.staleness).toEqual(edited);
	expect(rows.find((row) => row.kind === "replay")?.staleness).toEqual(edited);
	expect(rows.find((row) => row.kind === "group")?.staleness).toEqual(edited);
	expect(
		rows.find((row) => row.kind === "session-attempt")?.staleness,
	).toMatchObject({
		distance: {
			kind: "not-recorded",
			reason: "recorded before corpus versions",
		},
		state: "available",
	});
}

async function verifyCountsARowStaleOnlyFromCorpusFilesWhen(): Promise<void> {
	const { fixture, corpus } = await versionedHistoryFixture();
	await Bun.write(join(corpus, "CLAUDE.md"), "edited instructions\n");

	const { rows } = await runHistoryReport(
		{ runsDirectory: fixture.runsDirectory, source: directorySource(corpus) },
		nothingRunning,
	);

	for (const row of [
		pipelineRun(rows, fixture.replayableRun),
		rows.find(({ kind }) => kind === "replay"),
		rows.find(({ kind }) => kind === "group"),
	]) {
		expect(row?.staleness).toMatchObject({
			onlyCorpusFiles: true,
			stale: true,
			state: "available",
		});
	}
}

async function verifySaysWhyARowSStalenessCouldNotBe(): Promise<void> {
	const fixture = await fixtureRecordingLiveSettings();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.unreplayableRun)?.staleness).toEqual({
		reasons: [UNJUDGED_REASON],
		state: "unavailable",
	});
}

async function verifyNamesNoAbsoluteFilesystemPathInWhyARow(): Promise<void> {
	const fixture = await fixtureRecordingLiveSettings();
	const corpus = await corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await fixture.corpus.recordReplayFrom(directorySource(corpus));
	await rm(
		benchmarkRunPaths(fixture.runsDirectory, fixture.replayableRun)
			.manifestFile,
	);

	const { rows } = await runHistoryReport(
		{ runsDirectory: fixture.runsDirectory, source: directorySource(corpus) },
		nothingRunning,
	);

	const replay = rows.find((row) => row.kind === "replay");
	expect(replay?.staleness.state).toBe("unavailable");
	expect(JSON.stringify(replay?.staleness)).not.toContain(
		fixture.runsDirectory,
	);
}

async function verifyMarksARowCleanWhenItsLatestCheckpointS(): Promise<void> {
	const fixture = await fixtureRecordingLiveSettings();
	const corpus = await corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));

	const { rows } = await runHistoryReport(
		{ runsDirectory: fixture.runsDirectory, source: directorySource(corpus) },
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.replayableRun)?.staleness).toMatchObject({
		causes: [],
		stale: false,
		state: "available",
	});
}
