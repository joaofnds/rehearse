import { describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";
import { join } from "node:path";

import { failureOf, recordOutput } from "#cli/cli-test-support";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import runStale from "#cli/stale-command";

import StaleCorpusFixture from "./stale-corpus-test-fixture";

const corpusFixture = StaleCorpusFixture.forEachTest();

async function refusesThePreconditionAndPrintsNothingOnStdout(): Promise<void> {
	const fixture = await corpusFixture.fixtureRecordedAgainst(
		await corpusFixture.corpusDirectory("build skill\n"),
	);
	const recorder = recordOutput();

	const corpus = join(
		await corpusFixture.temporaryDirectory("rehearse-absent-"),
		"gone",
	);
	const failure = await failureOf(
		runStale(
			{
				corpus,
				effort: undefined,
				model: undefined,
				runsDirectory: fixture.runsDirectory,
			},
			{ output: recorder.output },
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("gone");
	expect(recorder.stdout).toEqual([]);
}

async function printsTheRecordsItCouldDeriveRatherThanRefusing(): Promise<void> {
	const corpus = await corpusFixture.corpusDirectory("build skill\n");
	const fixture = await corpusFixture.fixtureRecordedAgainst(corpus);
	await symlink(
		join(corpus, "CLAUDE.md"),
		join(corpus, "skills", "build", "escape.md"),
	);
	const recorder = recordOutput();

	await runStale(
		{ corpus, runsDirectory: fixture.runsDirectory },
		{ output: recorder.output },
	);

	expect(recorder.stdout.join("")).toContain(
		`checkpoint:${fixture.replayableRun}/build`,
	);
}

async function namesTheEntryThatCouldNotBeHashedAs(): Promise<void> {
	const corpus = await corpusFixture.corpusDirectory("build skill\n");
	const fixture = await corpusFixture.fixtureRecordedAgainst(corpus);
	await symlink(
		join(corpus, "CLAUDE.md"),
		join(corpus, "skills", "build", "escape.md"),
	);
	const recorder = recordOutput();

	await runStale(
		{ corpus, runsDirectory: fixture.runsDirectory },
		{ output: recorder.output },
	);

	expect(recorder.stdout.join("")).toContain("skills/build/escape.md");
}

async function namesACLAUDEMdThatIsASymlinkOut(): Promise<void> {
	const fixture = await corpusFixture.fixtureRecordedAgainst(
		await corpusFixture.corpusDirectory("build skill\n"),
	);
	const linked = await corpusFixture.corpusDirectory("build skill\n");
	const outside = await corpusFixture.escapeInstructions(linked);
	const recorder = recordOutput();

	await runStale(
		{ corpus: linked, runsDirectory: fixture.runsDirectory },
		{ output: recorder.output },
	);

	const printed = recorder.stdout.join("");
	expect(printed).toContain(`checkpoint:${fixture.replayableRun}/build`);
	expect(printed).toContain("CLAUDE.md resolves outside the corpus source");
	expect(printed).not.toContain("SECRET BYTES");
	expect(printed).not.toContain(outside);
}

function whenCorpusNamesADirectoryThatDoesNotExistCases(): void {
	it(
		"refuses the precondition and prints nothing on stdout",
		refusesThePreconditionAndPrintsNothingOnStdout,
	);
}

function whenACorpusLayoutDirectoryHoldsASymlinkOutOfTheTreeCases(): void {
	it(
		"prints the records it could derive rather than refusing the whole report",
		printsTheRecordsItCouldDeriveRatherThanRefusing,
	);
	it(
		"names the entry that could not be hashed as the cause",
		namesTheEntryThatCouldNotBeHashedAs,
	);
}

function runStaleCases(): void {
	it(
		"names a CLAUDE.md that is a symlink out of the root as a cause, carrying neither its target nor its bytes",
		namesACLAUDEMdThatIsASymlinkOut,
	);
	describe(
		"when --corpus names a directory that does not exist",
		whenCorpusNamesADirectoryThatDoesNotExistCases,
	);
	describe(
		"when a corpus layout directory holds a symlink out of the tree",
		whenACorpusLayoutDirectoryHoldsASymlinkOutOfTheTreeCases,
	);
}

describe(runStale.name, runStaleCases);
