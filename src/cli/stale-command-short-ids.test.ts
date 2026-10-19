import { describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { recordOutput } from "#cli/cli-test-support";
import runStale from "#cli/stale-command";

import StaleCorpusFixture from "./stale-corpus-test-fixture";

const corpusFixture = StaleCorpusFixture.forEachTest();

const IDENTITY_AND_STATUS_COLUMN_COUNT = 2;

const RECORD_ID_COLUMN_INDEX = 0;

const PREFIX_START_INDEX = 0;

const SMOKE_ATTEMPT =
	"attempt:session:smoke/0f6b6f2a-0000-4000-8000-000000000001";

const REPLAY_ATTEMPT = "attempt:stage:lineage-discuss/2026-09-03T01-00-00.000Z";

const GROUP = "group:group-1";

async function staleInEveryCase(): Promise<{
	readonly fixture: RecordedRunsFixture;
	readonly corpus: string;
}> {
	const fixture = await corpusFixture.fixtureRecordedAgainst(
		await corpusFixture.corpusDirectory("build skill\n"),
	);
	await fixture.claim("audit-log", fixture.auditLogClaims);
	await fixture.claim("smoke", fixture.smokeClaims);
	const corpus = await corpusFixture.corpusDirectory("build skill, edited\n");
	await Bun.write(
		join(corpus, "output-styles", "brief.md"),
		"brief style, edited\n",
	);

	return { corpus, fixture };
}

async function printsTheOtherCaseSShortIdsAndNone(): Promise<void> {
	const { fixture, corpus } = await staleInEveryCase();
	await mkdir(
		join(fixture.runsDirectory, "short-ids", "smoke", "claims", "99"),
	);
	const recorder = recordOutput();

	await runStale(
		{ corpus, runsDirectory: fixture.runsDirectory },
		{ output: recorder.output },
	);

	expect(
		recorder.stdout
			.join("")
			.trimEnd()
			.split("\n")
			.map((printed) =>
				printed
					.split("\t")
					.slice(PREFIX_START_INDEX, IDENTITY_AND_STATUS_COLUMN_COUNT)
					.join("\t"),
			),
	).toEqual([
		`checkpoint:${fixture.replayableRun}/discuss\taudit-log/r2/s1`,
		`checkpoint:${fixture.replayableRun}/build\taudit-log/r2/s2`,
		`${SMOKE_ATTEMPT}\t-`,
		`${REPLAY_ATTEMPT}\taudit-log/r3`,
		`${GROUP}\taudit-log/g4`,
	]);
	expect(recorder.stderr).toEqual([
		"short-ids/smoke: Directories cannot be read like files\n",
	]);
}

async function printsEveryStaleRecordWithoutAShortIdWhen(): Promise<void> {
	const { fixture, corpus } = await staleInEveryCase();
	await rm(join(fixture.runsDirectory, "short-ids"), { recursive: true });
	await Bun.write(join(fixture.runsDirectory, "short-ids"), "");
	const recorder = recordOutput();

	await runStale(
		{ corpus, runsDirectory: fixture.runsDirectory },
		{ output: recorder.output },
	);

	expect(
		recorder.stdout
			.join("")
			.trimEnd()
			.split("\n")
			.map((printed) =>
				printed
					.split("\t")
					.slice(PREFIX_START_INDEX, IDENTITY_AND_STATUS_COLUMN_COUNT)
					.join("\t"),
			),
	).toEqual([
		`checkpoint:${fixture.replayableRun}/discuss\t-`,
		`checkpoint:${fixture.replayableRun}/build\t-`,
		`${SMOKE_ATTEMPT}\t-`,
		`${REPLAY_ATTEMPT}\t-`,
		`${GROUP}\t-`,
	]);
	expect(recorder.stderr).toEqual([
		expect.stringMatching(/^short-ids: ENOTDIR: not a directory/u),
	]);
}

async function stillPrintsTheStaleRecordsAndNamesTheRun(): Promise<void> {
	const fixture = await corpusFixture.fixtureRecordedAgainst(
		await corpusFixture.corpusDirectory("build skill\n"),
	);
	const brokenRun = "2026-09-12T00-00-00.000Z";
	await fixture.pipeline.writePipelineRun({
		caseId: "audit-log",
		run: brokenRun,
	});
	await Bun.write(
		benchmarkRunPaths(fixture.runsDirectory, brokenRun).manifestFile,
		"{ not json",
	);
	const recorder = recordOutput();

	await runStale(
		{
			corpus: await corpusFixture.corpusDirectory("build skill, edited\n"),
			runsDirectory: fixture.runsDirectory,
		},
		{ output: recorder.output },
	);

	expect(
		recorder.stdout
			.join("")
			.trimEnd()
			.split("\n")
			.map((printed) => printed.split("\t")[RECORD_ID_COLUMN_INDEX]),
	).toEqual([
		`checkpoint:${fixture.replayableRun}/build`,
		REPLAY_ATTEMPT,
		GROUP,
	]);
	expect(recorder.stderr.join("")).toContain(`run:${brokenRun}`);
}

function whenShortIdRegistriesCannotBeReadCases(): void {
	it(
		"prints the other case's short ids and none for the damaged case's record",
		printsTheOtherCaseSShortIdsAndNone,
	);
	it(
		"prints every stale record without a short id when the registries cannot be listed",
		printsEveryStaleRecordWithoutAShortIdWhen,
	);
}

function whenAnotherRunsManifestDoesNotParseCases(): void {
	it(
		"still prints the stale records and names the run on stderr",
		stillPrintsTheStaleRecordsAndNamesTheRun,
	);
}

function runStaleCases(): void {
	describe(
		"when short id registries cannot be read",
		whenShortIdRegistriesCannotBeReadCases,
	);
	describe(
		"when another run's manifest does not parse",
		whenAnotherRunsManifestDoesNotParseCases,
	);
}

describe(runStale.name, runStaleCases);
