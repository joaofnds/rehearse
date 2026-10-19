import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { directorySource } from "#benchmark/run-records-test-support";
import { recordOutput } from "#cli/cli-test-support";
import runStale from "#cli/stale-command";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import StaleCorpusFixture from "./stale-corpus-test-fixture";

const corpusFixture = StaleCorpusFixture.forEachTest();

const RECORD_ID_COLUMN_INDEX = 0;

const FIRST_PRINTED_LINE_INDEX = 0;

const REPLAY_ATTEMPT = "attempt:stage:lineage-discuss/2026-09-03T01-00-00.000Z";

const GROUP = "group:group-1";

async function namesEachStaleCheckpointWithItsCausesAndNo(): Promise<void> {
	const fixture = await corpusFixture.fixtureRecordedAgainst(
		await corpusFixture.corpusDirectory("build skill\n"),
	);
	const recorder = recordOutput();

	await runStale(
		{
			corpus: await corpusFixture.corpusDirectory("build skill, edited\n"),
			runsDirectory: fixture.runsDirectory,
		},
		{ output: recorder.output },
	);

	const printed = recorder.stdout.join("").trimEnd().split("\n");
	expect(
		printed.map(
			(printedLine) => printedLine.split("\t")[RECORD_ID_COLUMN_INDEX],
		),
	).toEqual([
		`checkpoint:${fixture.replayableRun}/build`,
		REPLAY_ATTEMPT,
		GROUP,
	]);
	expect(printed.at(FIRST_PRINTED_LINE_INDEX)).toContain(
		"skills/build/SKILL.md changed",
	);
}

async function namesAStaleCheckpointByItsShortIdBeside(): Promise<void> {
	const fixture = await corpusFixture.fixtureRecordedAgainst(
		await corpusFixture.corpusDirectory("build skill\n"),
	);
	await fixture.claim("audit-log", fixture.auditLogClaims);
	const recorder = recordOutput();

	await runStale(
		{
			corpus: await corpusFixture.corpusDirectory("build skill, edited\n"),
			runsDirectory: fixture.runsDirectory,
		},
		{ output: recorder.output },
	);

	expect(recorder.stdout.join("").trimEnd().split("\n")).toEqual([
		`checkpoint:${fixture.replayableRun}/build\taudit-log/r2/s2\tdistance not recorded\tskills/build/SKILL.md changed`,
		`${REPLAY_ATTEMPT}\taudit-log/r3\tdistance not recorded\tskills/build/SKILL.md changed`,
		`${GROUP}\taudit-log/g4\tdistance not recorded\tskills/build/SKILL.md changed`,
	]);
}

async function printsHowManyVersionsAStaleCheckpointSitsBehind(): Promise<void> {
	const corpus = await corpusFixture.corpusDirectory("build skill\n");
	const fixture = await corpusFixture.fixtureRecordedAgainst(corpus);
	await fixture.corpus.recordVersionFrom(directorySource(corpus));
	await Bun.write(
		join(corpus, "skills", "build", "SKILL.md"),
		"build skill, edited\n",
	);
	const recorder = recordOutput();

	await runStale(
		{ corpus, runsDirectory: fixture.runsDirectory },
		{ output: recorder.output },
	);

	expect(recorder.stdout.join("").trimEnd().split("\n")).toEqual([
		`checkpoint:${fixture.replayableRun}/build\t-\tdistance 1\tskills/build/SKILL.md changed`,
		`${REPLAY_ATTEMPT}\t-\tdistance 1\tskills/build/SKILL.md changed`,
		`${GROUP}\t-\tdistance 1\tskills/build/SKILL.md changed`,
	]);
}

async function namesNoCheckpointWhenTheCorpusHoldsTheRecorded(): Promise<void> {
	const corpus = await corpusFixture.corpusDirectory("build skill\n");
	const fixture = await corpusFixture.fixtureRecordedAgainst(corpus);
	const recorder = recordOutput();

	await runStale(
		{
			corpus,
			runsDirectory: fixture.runsDirectory,
		},
		{ output: recorder.output },
	);

	expect(recorder.stdout).toEqual([]);
}

async function namesAnInitialOnlyStoppedRunWhenItsSettings(): Promise<void> {
	const corpus = await corpusFixture.corpusDirectory("build skill\n");
	const fixture = await corpusFixture.fixtureRecordedAgainst(corpus);
	await fixture.stopped.writeStoppedRun();
	await fixture.pipeline.writeInitialCheckpoint(fixture.stoppedRun, {
		path: "stage-settings.json",
		sha256: "0".repeat(SHA256_HEX_DIGITS),
	});
	const recorder = recordOutput();

	await runStale(
		{ corpus, runsDirectory: fixture.runsDirectory },
		{ output: recorder.output },
	);

	expect(recorder.stdout.join("").trimEnd().split("\n")).toEqual([
		`checkpoint:${fixture.stoppedRun}/initial\t-\tdistance not recorded\tstage settings file stage-settings.json changed`,
	]);
}

describe(runStale.name, () => {
	it(
		"names each stale checkpoint with its causes, and no fresh one",
		namesEachStaleCheckpointWithItsCausesAndNo,
	);
	it(
		"names a stale checkpoint by its short id beside its Record ID",
		namesAStaleCheckpointByItsShortIdBeside,
	);
	it(
		"prints how many versions a stale checkpoint sits behind the corpus under test",
		printsHowManyVersionsAStaleCheckpointSitsBehind,
	);
	it(
		"names no checkpoint when the corpus holds the recorded bytes",
		namesNoCheckpointWhenTheCorpusHoldsTheRecorded,
	);
	it(
		"names an initial-only stopped run when its settings are stale",
		namesAnInitialOnlyStoppedRunWhenItsSettings,
	);
});
