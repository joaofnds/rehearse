import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { UsageError } from "#cli/command-usage";
import {
	runCorpusInvalidation,
	runCorpusShow,
	runCorpusVersions,
} from "#cli/corpus-command";

import CorpusCommandFixture from "./corpus-command-test-fixture";

const corpusFixture = CorpusCommandFixture.forEachTest();
const { source, scratch, runsDirectory } = corpusFixture;

const CORPUS_VERSION_PREVIEW_CHARACTERS = 6;

const PREFIX_START_INDEX = 0;

async function listsTheNamedSourceSVersionsInLogOrder(): Promise<void> {
	const [first = "", second = ""] = await corpusFixture.measureThenEdit();
	const recorder = recordOutput();

	await runCorpusVersions(
		{ corpus: source.root, runsDirectory },
		{ output: recorder.output },
	);

	expect(recorder.stdout.join("")).toBe(
		`1\tcorpus@${first.slice(PREFIX_START_INDEX, CORPUS_VERSION_PREVIEW_CHARACTERS)}\t${first}\n2\tcorpus@${second.slice(PREFIX_START_INDEX, CORPUS_VERSION_PREVIEW_CHARACTERS)}\t${second}\n`,
	);
}

async function refusesACorpusSourceThatIsNotADirectory(): Promise<void> {
	const failure = await failureOf(
		runCorpusVersions(
			{ corpus: join(scratch, "absent"), runsDirectory },
			{ output: recordOutput().output },
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
}

async function printsEachFileSReadByAndInvalidatedCounts(): Promise<void> {
	const { fixture, previous } = await corpusFixture.recordEditedBuildSkill();
	const recorder = recordOutput();

	await runCorpusInvalidation(
		{ corpus: source.root, runsDirectory },
		{ output: recorder.output },
	);

	expect(recorder.stdout.join("")).toBe(
		[
			"1\t0\tCLAUDE.md\n",
			"2\t1\tskills/build/SKILL.md\n",
			"1\t0\tskills/discuss/SKILL.md\n",
			"2\t0\toutput-styles/brief.md\n",
			`last edit from corpus@${previous.slice(PREFIX_START_INDEX, CORPUS_VERSION_PREVIEW_CHARACTERS)} invalidated 1 row\n`,
			`run:${fixture.replayableRun}\n`,
		].join(""),
	);
}

async function saysTheLastEditIsNotRecordedWhenThe(): Promise<void> {
	const recorder = recordOutput();

	await runCorpusInvalidation(
		{ corpus: source.root, runsDirectory },
		{ output: recorder.output },
	);

	expect(recorder.stdout.join("")).toBe(
		"0\t0\tCLAUDE.md\n0\t0\toutput-styles/brief.md\nlast edit not recorded: the corpus under test has no earlier version in its log to compare against\n",
	);
}

async function printsAFileSBytesAsAnOlderVersion(): Promise<void> {
	const [first = ""] = await corpusFixture.measureThenEdit();
	const recorder = recordOutput();

	await runCorpusShow(
		{
			file: "output-styles/brief.md",
			runsDirectory,
			version: `corpus@${first.slice(PREFIX_START_INDEX, CORPUS_VERSION_PREVIEW_CHARACTERS)}`,
		},
		recorder.output,
	);

	expect(recorder.stdout.join("")).toBe("brief\n");
}

async function listsAVersionSFilesWithTheirHashesWhen(): Promise<void> {
	const [first = ""] = await corpusFixture.measureThenEdit();
	const recorder = recordOutput();

	await runCorpusShow(
		{
			file: undefined,
			runsDirectory,
			version: first.slice(
				PREFIX_START_INDEX,
				CORPUS_VERSION_PREVIEW_CHARACTERS,
			),
		},
		recorder.output,
	);

	expect(recorder.stdout.join("")).toMatch(
		/^[0-9a-f]{64}\tCLAUDE\.md\n[0-9a-f]{64}\toutput-styles\/brief\.md\n$/u,
	);
}

async function refusesAPrefixSeveralVersionsShareNamingEachCandidate(): Promise<void> {
	// Both versions of this fixed tree start with "d".
	await corpusFixture.measureThenEdit("edit 4\n");

	const failure = await failureOf(
		runCorpusShow(
			{ file: undefined, runsDirectory, version: "corpus@d" },
			recordOutput().output,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toBe(
		"Corpus version corpus@d is ambiguous; it matches d86658fcc2d40b287a828747950f2d2ec902111a794516b112ff0e90dfd3842c, dcae610193682abd5ab633e4fd0773af6cb7b86abb09e2c671cc520234c23849",
	);
}

async function refusesAPrefixNoVersionStartsWith(): Promise<void> {
	await corpusFixture.measureThenEdit();

	const failure = await failureOf(
		runCorpusShow(
			{ file: undefined, runsDirectory, version: "corpus@zzzzzz" },
			recordOutput().output,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
}

async function refusesAFileTheVersionDoesNotHold(): Promise<void> {
	const [first = ""] = await corpusFixture.measureThenEdit();

	const failure = await failureOf(
		runCorpusShow(
			{ file: "skills/absent.md", runsDirectory, version: first },
			recordOutput().output,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
}

async function takesTheVersionAsAUsageErrorWhenNone(): Promise<void> {
	const failure = await failureOf(
		runCorpusShow(
			{ file: undefined, runsDirectory, version: undefined },
			recordOutput().output,
		),
	);

	expect(failure).toBeInstanceOf(UsageError);
}

describe(runCorpusVersions.name, () => {
	it(
		"lists the named source's versions in log order by their corpus@ labels",
		listsTheNamedSourceSVersionsInLogOrder,
	);
	it(
		"refuses a corpus source that is not a directory in corpus layout",
		refusesACorpusSourceThatIsNotADirectory,
	);
});

describe(runCorpusInvalidation.name, () => {
	it(
		"prints each file's read-by and invalidated counts, then the rows the last edit invalidated by id",
		printsEachFileSReadByAndInvalidatedCounts,
	);
	it(
		"says the last edit is not recorded when the log holds no earlier version",
		saysTheLastEditIsNotRecordedWhenThe,
	);
});

describe(runCorpusShow.name, () => {
	it(
		"prints a file's bytes as an older version held them, after the source changed",
		printsAFileSBytesAsAnOlderVersion,
	);
	it(
		"lists a version's files with their hashes when no file is named",
		listsAVersionSFilesWithTheirHashesWhen,
	);
	it(
		"refuses a prefix several versions share, naming each candidate",
		refusesAPrefixSeveralVersionsShareNamingEachCandidate,
	);
	it(
		"refuses a prefix no version starts with",
		refusesAPrefixNoVersionStartsWith,
	);
	it(
		"refuses a file the version does not hold",
		refusesAFileTheVersionDoesNotHold,
	);
	it(
		"takes the version as a usage error when none is given",
		takesTheVersionAsAUsageErrorWhenNone,
	);
});
