import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { CorpusConfigurationError } from "#benchmark/corpus-file";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { directorySource } from "#benchmark/run-records-test-support";
import { CliTestWorkspace, recordOutput } from "#cli/cli-test-support";
import { runShow } from "#cli/show-command";

import {
	BUILD_SKILL_READ,
	BUILD_SKILL_SHA256,
	fixtureWithRepRead,
	stageCorpus,
} from "./confirmation-read-test-fixture";
import { corpusAt } from "./show-record-test-driver";

const workspace = CliTestWorkspace.forEachTest();

const SKILL_DIGEST_PREVIEW_CHARACTERS = 12;

const PREFIX_START_INDEX = 0;

async function printsEachRepStageSReadsInAGroup(): Promise<void> {
	const corpus = await stageCorpus(workspace);
	const fixture = await workspace.writtenRecords();
	await fixture.confirmations.corpus.recordGroupFrom(directorySource(corpus));
	const repId = `${fixture.groupId}-rep-1`;
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [BUILD_SKILL_READ],
		repId,
		stage: "build",
	});
	await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");

	const recorder = recordOutput();

	await runShow(
		{
			id: `group:${fixture.groupId}`,
			json: false,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		corpusAt(corpus),
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toContain(
		`| ${repId} | build | skills/build/SKILL.md | stage skill | declared | ${BUILD_SKILL_SHA256.slice(PREFIX_START_INDEX, SKILL_DIGEST_PREVIEW_CHARACTERS)} | changed |
States compare each file with the corpus at ${corpus} as it was when this summary was printed.`,
	);
}

async function listsAGroupSRepReadsUnjudgedAndNames(): Promise<void> {
	const fixture = await fixtureWithRepRead(workspace);

	const recorder = recordOutput();

	await runShow(
		{
			id: `group:${fixture.groupId}`,
			json: false,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		corpusAt(await stageCorpus(workspace)),
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toContain(
		`| ${fixture.groupId}-rep-1 | build | skills/build/SKILL.md | stage skill | declared | ${BUILD_SKILL_SHA256.slice(PREFIX_START_INDEX, SKILL_DIGEST_PREVIEW_CHARACTERS)} | not judged |
Reads not judged: the group froze no pipeline to hash its stages against.`,
	);
}

async function listsAGroupSRepReadsUnjudgedWhenThe(): Promise<void> {
	const fixture = await fixtureWithRepRead(workspace);

	const recorder = recordOutput();

	await runShow(
		{
			id: `group:${fixture.groupId}`,
			json: false,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		{
			resolveCorpus: async () =>
				await Promise.reject(
					new CorpusConfigurationError("the backing root is relative"),
				),
		},
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toContain(
		`| stage skill | declared | ${BUILD_SKILL_SHA256.slice(PREFIX_START_INDEX, SKILL_DIGEST_PREVIEW_CHARACTERS)} | not judged |
Reads not judged: the backing root is relative.`,
	);
}

async function listsAGroupSRepReadsUnjudgedWhenTheAgain(): Promise<void> {
	const fixture = await fixtureWithRepRead(workspace);

	const recorder = recordOutput();

	await runShow(
		{
			id: `group:${fixture.groupId}`,
			json: false,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		{
			resolveCorpus: async () =>
				await Promise.reject(
					new RefusedPreconditionError("the linked corpus is gone"),
				),
		},
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toContain(
		`| stage skill | declared | ${BUILD_SKILL_SHA256.slice(PREFIX_START_INDEX, SKILL_DIGEST_PREVIEW_CHARACTERS)} | not judged |
Reads not judged: the linked corpus is gone.`,
	);
}

describe(runShow.name, () => {
	it(
		"prints each rep stage's reads in a group's summary, with whether each file changed since",
		printsEachRepStageSReadsInAGroup,
	);
	it(
		"lists a group's rep reads unjudged and names why when they could not be judged",
		listsAGroupSRepReadsUnjudgedAndNames,
	);
	it(
		"lists a group's rep reads unjudged when the live install is misconfigured",
		listsAGroupSRepReadsUnjudgedWhenThe,
	);
	it(
		"lists a group's rep reads unjudged when the linked corpus is gone",
		listsAGroupSRepReadsUnjudgedWhenTheAgain,
	);
});
