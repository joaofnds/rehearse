import { describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";
import { join } from "node:path";

import { liveCorpusSource } from "#benchmark/corpus-file";
import type { LiveCorpusRoot } from "#benchmark/corpus-file";
import { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { recordOutput } from "#cli/cli-test-support";
import runStale from "#cli/stale-command";

import StaleCorpusFixture from "./stale-corpus-test-fixture";

const corpusFixture = StaleCorpusFixture.forEachTest();

const SMOKE_ATTEMPT =
	"attempt:session:smoke/0f6b6f2a-0000-4000-8000-000000000001";

async function answersForTheSessionCasesWhenNoRunRecorded(): Promise<void> {
	const root = await corpusFixture.temporaryDirectory(
		"rehearse-stale-cases-only-",
	);
	const fixture = new RecordedRunsFixture(root);
	await fixture.sessions.writeAttemptReading({
		caseId: "smoke",
		corpusRoot: await corpusFixture.corpusDirectory("build skill\n"),
		layoutPaths: ["output-styles/brief.md"],
	});
	const styles = await corpusFixture.temporaryDirectory(
		"rehearse-stale-styles-",
	);
	await Bun.write(
		join(styles, "output-styles", "brief.md"),
		"brief style, edited\n",
	);
	const recorder = recordOutput();

	await runStale(
		{ corpus: styles, runsDirectory: root },
		{ output: recorder.output },
	);

	expect(recorder.stdout.join("").trimEnd().split("\n")).toEqual([
		`${SMOKE_ATTEMPT}\t-\tdistance not recorded\toutput-styles/brief.md changed`,
	]);
}

async function namesNoAbsoluteFilesystemPathWhenTheCorpusLacks(): Promise<void> {
	const root = await corpusFixture.temporaryDirectory(
		"rehearse-stale-cli-missing-",
	);
	const fixture = new RecordedRunsFixture(root);
	await fixture.sessions.writeAttemptReading({
		caseId: "smoke",
		corpusRoot: await corpusFixture.corpusDirectory("build skill\n"),
		layoutPaths: ["output-styles/brief.md"],
	});
	const empty = await corpusFixture.temporaryDirectory(
		"rehearse-stale-cli-empty-",
	);
	await Bun.write(join(empty, "CLAUDE.md"), "the instructions\n");
	const recorder = recordOutput();

	await runStale(
		{ corpus: empty, runsDirectory: root },
		{ output: recorder.output },
	);

	expect(recorder.stdout.join("")).toContain(SMOKE_ATTEMPT);
	expect(recorder.stdout.join("")).not.toContain(empty);
}

async function namesTheInstructionFileTheCorpusLacksAsA(): Promise<void> {
	const corpus = await corpusFixture.corpusDirectory("build skill\n");
	const fixture = await corpusFixture.fixtureRecordedAgainst(corpus);
	const styles = await corpusFixture.temporaryDirectory(
		"rehearse-stale-styles-only-",
	);
	await Bun.write(join(styles, "output-styles", "brief.md"), "brief style\n");
	const recorder = recordOutput();

	await runStale(
		{ corpus: styles, runsDirectory: fixture.runsDirectory },
		{ output: recorder.output },
	);

	const printed = recorder.stdout.join("");
	expect(printed).toContain(`checkpoint:${fixture.replayableRun}/build`);
	expect(printed).toContain(
		"Corpus file CLAUDE.md is not in the corpus under test",
	);
	expect(printed).not.toContain(styles);
}

async function stagedLiveCorpus(): Promise<LiveCorpusRoot> {
	const root = await corpusFixture.temporaryDirectory(
		"rehearse-stale-live-install-",
	);
	const backingRoot = await corpusFixture.corpusDirectory("build skill\n");
	await Bun.write(
		join(backingRoot, "output-styles", "brief.md"),
		"brief style, current live install\n",
	);
	await symlink(
		join(backingRoot, "output-styles"),
		join(root, "output-styles"),
	);

	return liveCorpusSource({ backingRoot, root });
}

async function comparesACaseAgainstTheLiveInstallNotA(): Promise<void> {
	const root = await corpusFixture.temporaryDirectory(
		"rehearse-stale-live-cli-",
	);
	const fixture = new RecordedRunsFixture(root);
	await fixture.sessions.writeAttemptReading({
		caseId: "smoke",
		corpusRoot: await corpusFixture.corpusDirectory("build skill\n"),
		layoutPaths: ["output-styles/brief.md"],
	});
	const recorder = recordOutput();
	const live = await stagedLiveCorpus();

	await runStale(
		{ corpus: undefined, runsDirectory: root },
		{
			output: recorder.output,
			resolveCorpus: async () => await Promise.resolve(live),
		},
	);

	expect(recorder.stdout.join("")).toContain(SMOKE_ATTEMPT);
	expect(recorder.stdout.join("")).toContain("output-styles/brief.md");
}

function andARunRecordedACheckpointCases(): void {
	it(
		"names the instruction file the corpus lacks as a cause",
		namesTheInstructionFileTheCorpusLacksAsA,
	);
}

function whenTheCorpusHoldsNoCLAUDEmdCases(): void {
	it(
		"answers for the session cases when no run recorded a checkpoint",
		answersForTheSessionCasesWhenNoRunRecorded,
	);
	it(
		"names no absolute filesystem path when the corpus lacks the declared file",
		namesNoAbsoluteFilesystemPathWhenTheCorpusLacks,
	);
	describe("and a run recorded a checkpoint", andARunRecordedACheckpointCases);
}

function whenNoCorpusIsGivenWhichIsTheLiveInstallCases(): void {
	it(
		"compares a case against the live install, not a corpus root",
		comparesACaseAgainstTheLiveInstallNotA,
	);
}

function runStaleCases(): void {
	describe(
		"when no --corpus is given, which is the live install",
		whenNoCorpusIsGivenWhichIsTheLiveInstallCases,
	);
	describe(
		"when the corpus holds no CLAUDE.md",
		whenTheCorpusHoldsNoCLAUDEmdCases,
	);
}

describe(runStale.name, runStaleCases);
