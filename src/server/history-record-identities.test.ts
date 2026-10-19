import { afterEach, describe, expect, it } from "bun:test";

import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import {
	benchmarkRunPaths,
	checkpointRecordFile,
	confirmationGroupPaths,
} from "#benchmark/run-layout";
import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";
import {
	fileStates,
	pipelineRun,
	recordCorpusVersion,
	recordGroupCorpusVersion,
} from "#server/history-record-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

describe("history record identities", () => {
	it(
		"names a run's status, stage, and grade from its own records",
		verifyNamesARunSStatusStageAndGradeFrom,
	);

	it(
		"names every kind of row by the record id that selects it alone",
		verifyNamesEveryKindOfRowByTheRecordId,
	);

	it(
		"names on every kind of row the corpus version its record measured, and reads an older record as not recorded",
		verifyNamesOnEveryKindOfRowTheCorpusVersion,
	);

	it(
		"shows a run's latest stage version and says the corpus changed when its stages measured different versions",
		verifyShowsARunSLatestStageVersionAndSays,
	);

	it(
		"writes nothing under the runs directory except the run event database",
		verifyWritesNothingUnderTheRunsDirectoryExceptTheRun,
	);
});

async function verifyNamesARunSStatusStageAndGradeFrom(): Promise<void> {
	const fixture = await writtenFixture();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.replayableRun)).toMatchObject({
		caseId: "audit-log",
		grade: "B",
		run: fixture.replayableRun,
		stage: "build",
		status: "COMPLETE",
	});
}

async function verifyNamesEveryKindOfRowByTheRecordId(): Promise<void> {
	const fixture = await writtenFixture();
	const source = directorySource(await corpusDirectory("build skill\n"));
	const { rows } = await runHistoryReport(
		{ runsDirectory: fixture.runsDirectory, source },
		nothingRunning,
	);

	const selected = await Promise.all(
		rows.map(async ({ recordId }) => {
			const report = await runHistoryReport(
				{ runsDirectory: fixture.runsDirectory, source },
				nothingRunning,
				new Set([recordId]),
			);

			return report.rows;
		}),
	);

	expect(new Set(rows.map(({ kind }) => kind))).toEqual(
		new Set(["run", "session-attempt", "replay", "group"]),
	);
	expect(selected).toEqual(rows.map((row) => [row]));
}

async function verifyNamesOnEveryKindOfRowTheCorpusVersion(): Promise<void> {
	const fixture = await writtenFixture();
	const version: CorpusMeasurement = {
		digest: "a".repeat(SHA256_HEX_DIGITS),
		kind: "version",
	};
	const refused: CorpusMeasurement = {
		kind: "refused",
		refusal: "a symlink escapes the root",
	};
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.replayableRun);
	await Array.fromAsync(fixture.stages, async (stage) => {
		await recordCorpusVersion(
			checkpointRecordFile(paths.checkpointDirectory(stage)),
			version,
		);
	});
	await recordCorpusVersion(fixture.stageAttemptFile, refused);
	await recordCorpusVersion(fixture.sessionAttemptFile, version);
	await recordGroupCorpusVersion(
		confirmationGroupPaths(fixture.runsDirectory, fixture.groupId).groupFile,
		version,
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect({
		groupVersion: rows.find((row) => row.kind === "group")?.corpusVersion,
		olderVersion: pipelineRun(rows, fixture.unreplayableRun)?.corpusVersion,
		replayVersion: rows.find((row) => row.kind === "replay")?.corpusVersion,
		run: pipelineRun(rows, fixture.replayableRun),
		sessionVersion: rows.find((row) => row.kind === "session-attempt")
			?.corpusVersion,
	}).toMatchObject({
		groupVersion: { ...version },
		olderVersion: undefined,
		replayVersion: refused,
		run: { corpusChangedDuringRun: false, corpusVersion: { ...version } },
		sessionVersion: { ...version },
	});
}

async function verifyShowsARunSLatestStageVersionAndSays(): Promise<void> {
	const fixture = await writtenFixture();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.replayableRun);
	const [first, last] = fixture.stages;
	const later: CorpusMeasurement = {
		digest: "b".repeat(SHA256_HEX_DIGITS),
		kind: "version",
	};
	await recordCorpusVersion(
		checkpointRecordFile(paths.checkpointDirectory(first ?? "")),
		{ digest: "a".repeat(SHA256_HEX_DIGITS), kind: "version" },
	);
	await recordCorpusVersion(
		checkpointRecordFile(paths.checkpointDirectory(last ?? "")),
		later,
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(pipelineRun(rows, fixture.replayableRun)).toMatchObject({
		corpusChangedDuringRun: true,
		corpusVersion: later,
	});
}

async function verifyWritesNothingUnderTheRunsDirectoryExceptTheRun(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.stopped.writeStoppedRun();
	await fixture.confirmations.records.writeSessionGroup("group-s");
	await fixture.events.writeEventsOnlyFailedRun();
	await fixture.pipeline.writeEmptyRunDirectory("any-name-1");
	const before = await fileStates(fixture.runsDirectory);

	await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	const after = await fileStates(fixture.runsDirectory);
	const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
		(path) => before.get(path) !== after.get(path),
	);
	expect(
		changed.filter((path) => !path.startsWith("run-events.sqlite")),
	).toEqual([]);
}
