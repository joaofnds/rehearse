import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { recordOutput } from "#cli/cli-test-support";
import runStale from "#cli/stale-command";

import StaleCorpusFixture from "./stale-corpus-test-fixture";

const corpusFixture = StaleCorpusFixture.forEachTest();

const RECORD_ID_COLUMN_INDEX = 0;

const COMES_AFTER = 1;
const COMES_BEFORE = -1;

const FIRST_PRINTED_LINE_INDEX = 0;

const THIRD_PRINTED_LINE_INDEX = 2;

const FOURTH_PRINTED_LINE_INDEX = 3;

const HALF_WRITTEN_UUID = "0f6b6f2a-0000-4000-8000-00000000000f";

const SMOKE_ATTEMPT =
	"attempt:session:smoke/0f6b6f2a-0000-4000-8000-000000000001";

const REPLAY_ATTEMPT = "attempt:stage:lineage-discuss/2026-09-03T01-00-00.000Z";

const GROUP = "group:group-1";

async function treeOf(root: string): Promise<readonly string[]> {
	const entries = await readdir(root, { recursive: true });

	return entries.toSorted((left, right) =>
		left < right ? COMES_BEFORE : COMES_AFTER,
	);
}

async function digestOfTree(root: string): Promise<readonly string[]> {
	const entries = await readdir(root, {
		recursive: true,
		withFileTypes: true,
	});
	const digests: string[] = [];

	await Array.fromAsync(
		entries.toSorted((left, right) =>
			left.name < right.name ? COMES_BEFORE : COMES_AFTER,
		),
		async (entry) => {
			const path = join(entry.parentPath, entry.name);
			digests.push(
				entry.isFile()
					? `${path}:${new Bun.CryptoHasher("sha256")
							.update(await Bun.file(path).bytes())
							.digest("hex")}`
					: `${path}:directory`,
			);
		},
	);

	return digests.toSorted();
}

async function namesAStaleSessionAttemptBesideTheStaleCheckpoints(): Promise<void> {
	const fixture = await corpusFixture.fixtureRecordedAgainst(
		await corpusFixture.corpusDirectory("build skill\n"),
	);
	const edited = await corpusFixture.corpusDirectory("build skill, edited\n");
	await Bun.write(
		join(edited, "output-styles", "brief.md"),
		"brief style, edited\n",
	);
	const recorder = recordOutput();

	await runStale(
		{
			corpus: edited,
			runsDirectory: fixture.runsDirectory,
		},
		{ output: recorder.output },
	);

	// An output style joins every stage's corpus, the same as a global
	// skill: editing it stales the discuss checkpoint too, not only build's.
	const printed = recorder.stdout.join("").trimEnd().split("\n");
	expect(
		printed.map((line) => line.split("\t")[RECORD_ID_COLUMN_INDEX]),
	).toEqual([
		`checkpoint:${fixture.replayableRun}/discuss`,
		`checkpoint:${fixture.replayableRun}/build`,
		SMOKE_ATTEMPT,
		REPLAY_ATTEMPT,
		GROUP,
	]);
	expect(printed.at(FIRST_PRINTED_LINE_INDEX)).toContain(
		"output-styles/brief.md changed",
	);
	expect(printed.at(THIRD_PRINTED_LINE_INDEX)).toContain(
		"output-styles/brief.md changed",
	);
}

async function startsNoSessionRunsNoCommandAndWritesNo(): Promise<void> {
	const corpus = await corpusFixture.corpusDirectory("build skill, edited\n");
	const fixture = await corpusFixture.fixtureRecordedAgainst(
		await corpusFixture.corpusDirectory("build skill\n"),
	);
	const before = await treeOf(fixture.runsDirectory);
	const beforeDigests = await digestOfTree(fixture.runsDirectory);

	await runStale(
		{
			corpus,
			runsDirectory: fixture.runsDirectory,
		},
		{ output: recordOutput().output },
	);

	expect(await treeOf(fixture.runsDirectory)).toEqual(before);
	expect(await digestOfTree(fixture.runsDirectory)).toEqual(beforeDigests);
}

async function namesEveryCheckpointStaleOnTheModelCorpusUnchanged(): Promise<void> {
	const corpus = await corpusFixture.corpusDirectory("build skill\n");
	const fixture = await corpusFixture.fixtureRecordedAgainst(corpus);
	const recorder = recordOutput();

	await runStale(
		{
			corpus,
			effort: undefined,
			model: "opus",
			runsDirectory: fixture.runsDirectory,
		},
		{ output: recorder.output },
	);

	const printed = recorder.stdout.join("").trimEnd().split("\n");
	expect(
		printed.map((line) => line.split("\t")[RECORD_ID_COLUMN_INDEX]),
	).toEqual([
		`checkpoint:${fixture.replayableRun}/discuss`,
		`checkpoint:${fixture.replayableRun}/build`,
		REPLAY_ATTEMPT,
		GROUP,
	]);
	expect(printed.at(FIRST_PRINTED_LINE_INDEX)).toContain(
		"model sonnet is now opus",
	);
	expect(printed.at(THIRD_PRINTED_LINE_INDEX)).toContain(
		"model sonnet is now opus",
	);
	expect(printed.at(FOURTH_PRINTED_LINE_INDEX)).toContain(
		"model sonnet is now opus",
	);
}

async function stillPrintsTheStaleCheckpointsAndNamesItOn(): Promise<void> {
	const fixture = await corpusFixture.fixtureRecordedAgainst(
		await corpusFixture.corpusDirectory("build skill\n"),
	);
	await fixture.sessions.writeUnreadableAttempt({
		caseId: "smoke",
		uuid: HALF_WRITTEN_UUID,
	});
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
	expect(recorder.stderr.join("")).toContain(
		`attempt:session:smoke/${HALF_WRITTEN_UUID}`,
	);
}

function whenTheSessionNamesAModelTheRunWasNotRecordedAtCases(): void {
	it(
		"names every checkpoint stale on the model, corpus unchanged",
		namesEveryCheckpointStaleOnTheModelCorpusUnchanged,
	);
}

function whenOneAttemptRecordCannotBeReadCases(): void {
	it(
		"still prints the stale checkpoints and names it on stderr",
		stillPrintsTheStaleCheckpointsAndNamesItOn,
	);
}

function runStaleCases(): void {
	it(
		"names a stale session attempt beside the stale checkpoints",
		namesAStaleSessionAttemptBesideTheStaleCheckpoints,
	);
	it(
		"starts no session, runs no command, and writes no file",
		startsNoSessionRunsNoCommandAndWritesNo,
	);
	describe(
		"when the session names a model the run was not recorded at",
		whenTheSessionNamesAModelTheRunWasNotRecordedAtCases,
	);
	describe(
		"when one attempt record cannot be read",
		whenOneAttemptRecordCannotBeReadCases,
	);
}

describe(runStale.name, runStaleCases);
