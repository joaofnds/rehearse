import { afterEach, describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";
import { join } from "node:path";

import { resolveCorpusSource } from "./corpus-source";
import { directorySource } from "./run-records-test-support";
import CheckpointCorpusFixtures from "./staleness-checkpoint-test-fixtures";
import { staleCheckpoints } from "./staleness-report";

const FIRST_STALENESS_RESULT_INDEX = 0;

const fixtures = new CheckpointCorpusFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function answersOverARunsDirectoryHoldingNoRunReachingNoSkill(): Promise<void> {
	const runsDirectory = await fixtures.temporaryDirectory(
		"rehearse-stale-live-",
	);

	const stale = await staleCheckpoints(
		runsDirectory,
		await resolveCorpusSource(),
	);

	expect(stale).toEqual([]);
}

async function answersForTheRunsItCanReadWithoutReadingInstructions(): Promise<void> {
	const root = await fixtures.temporaryDirectory("rehearse-stale-styles-");
	await Bun.write(join(root, "output-styles", "brief.md"), "brief style\n");
	const runsDirectory = await fixtures.temporaryDirectory(
		"rehearse-stale-empty-",
	);

	const stale = await staleCheckpoints(runsDirectory, {
		kind: "directory",
		root,
	});

	expect(stale).toEqual([]);
}

async function stalesTheStageThatReadsItNamingTheEntryAsTheCause(): Promise<void> {
	const fixture = await fixtures.writtenFixture();
	const corpus = await fixtures.corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await symlink(
		join(await fixtures.corpusDirectory("foreign skill\n"), "CLAUDE.md"),
		join(corpus, "skills", "build", "escape.md"),
	);

	const stale = await staleCheckpoints(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(stale.map(({ id }) => id)).toEqual([
		`checkpoint:${fixture.replayableRun}/build`,
	]);
	expect(stale.at(FIRST_STALENESS_RESULT_INDEX)?.causes.join(" ")).toContain(
		"skills/build/escape.md",
	);
}

async function judgesAStageThatDoesNotReadTheBrokenTreeNormally(): Promise<void> {
	const fixture = await fixtures.writtenFixture();
	const corpus = await fixtures.corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await symlink(
		join(await fixtures.corpusDirectory("foreign skill\n"), "CLAUDE.md"),
		join(corpus, "skills", "build", "escape.md"),
	);

	const stale = await staleCheckpoints(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(stale.map(({ id }) => id)).not.toContain(
		`checkpoint:${fixture.replayableRun}/discuss`,
	);
}

async function namesNoAbsoluteFilesystemPathInTheCause(): Promise<void> {
	const fixture = await fixtures.writtenFixture();
	const corpus = await fixtures.corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await symlink(
		join(await fixtures.corpusDirectory("foreign skill\n"), "CLAUDE.md"),
		join(corpus, "skills", "build", "escape.md"),
	);

	const stale = await staleCheckpoints(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(stale.flatMap(({ causes }) => causes).join(" ")).not.toContain(corpus);
}

describe(staleCheckpoints.name, () => {
	describe("when no corpus is named, which is the live install", () => {
		it(
			"answers over a runs directory holding no run, reaching no skill",
			answersOverARunsDirectoryHoldingNoRunReachingNoSkill,
		);
	});
	describe("when the corpus holds no CLAUDE.md", () => {
		it(
			"answers for the runs it can read without reading instructions",
			answersForTheRunsItCanReadWithoutReadingInstructions,
		);
	});
	describe("when a corpus directory holds a symlink out of the tree", () => {
		it(
			"stales the stage that reads it, naming the entry as the cause",
			stalesTheStageThatReadsItNamingTheEntryAsTheCause,
		);
		it(
			"judges a stage that does not read the broken tree normally",
			judgesAStageThatDoesNotReadTheBrokenTreeNormally,
		);
		it(
			"names no absolute filesystem path in the cause",
			namesNoAbsoluteFilesystemPathInTheCause,
		);
	});
});
