import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import {
	RecordedRunsFixture,
	directorySource,
} from "./run-records-test-support";
import ConfirmationCorpusFixtures from "./staleness-group-test-fixtures";
import { groupStaleness } from "./staleness-report";
import { sha256Of } from "./staleness-test-files";

const FIRST_STALE_RECORD_INDEX = 0;

const fixtures = new ConfirmationCorpusFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function reportsTheFilesEachFrozenStageReadByLayoutPathAndHash(): Promise<void> {
	const corpus = await fixtures.stageCorpus();
	const fixture = await fixtures.fixtureWithGroupFrom(corpus);

	const report = await groupStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records.at(FIRST_STALE_RECORD_INDEX)?.readFiles).toEqual([
		{
			path: "CLAUDE.md",
			sha256: sha256Of("the instructions\n"),
		},
		{
			path: "skills/discuss/SKILL.md",
			sha256: sha256Of("discuss\n"),
		},
		{
			path: "CLAUDE.md",
			sha256: sha256Of("the instructions\n"),
		},
		{
			path: "skills/build/SKILL.md",
			sha256: sha256Of("build\n"),
		},
	]);
}

async function namesEachFrozenStageCorpusFileThatChangedWithItsVersionDistance(): Promise<void> {
	const corpus = await fixtures.stageCorpus();
	const fixture = await fixtures.fixtureWithGroupFrom(corpus);
	await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");

	const report = await groupStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report).toEqual({
		records: [
			expect.objectContaining({
				causes: ["skills/build/SKILL.md changed"],
				changedFiles: [{ change: "changed", path: "skills/build/SKILL.md" }],
				distance: { kind: "measured", versions: 1 },
				id: `group:${fixture.groupId}`,
				onlyCorpusFiles: true,
				stale: true,
			}),
		],
		unreadable: [],
	});
}

async function namesAFileEveryStageFrozeOnce(): Promise<void> {
	const corpus = await fixtures.stageCorpus();
	const fixture = await fixtures.fixtureWithGroupFrom(corpus);
	await Bun.write(join(corpus, "CLAUDE.md"), "edited instructions\n");

	const report = await groupStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(
		report.records.map(({ causes, changedFiles }) => ({
			causes,
			changedFiles,
		})),
	).toEqual([
		{
			causes: ["CLAUDE.md changed"],
			changedFiles: [{ change: "changed", path: "CLAUDE.md" }],
		},
	]);
}

async function reportsTheGroupCleanAtDistance0WhenNothingItFrozeChanged(): Promise<void> {
	const corpus = await fixtures.stageCorpus();
	const fixture = await fixtures.fixtureWithGroupFrom(corpus);

	const report = await groupStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toEqual([
		expect.objectContaining({
			causes: [],
			changedFiles: [],
			distance: { kind: "measured", versions: 0 },
			id: `group:${fixture.groupId}`,
			onlyCorpusFiles: false,
			stale: false,
		}),
	]);
}

async function reportsAGroupFrozenWithoutItsStageSOwnSkillCleanWhenNothingItFrozeChanged(): Promise<void> {
	const corpus = await fixtures.stageCorpus();
	await rm(join(corpus, "skills", "build"), { recursive: true });
	const fixture = new RecordedRunsFixture(
		await fixtures.temporaryDirectory("rehearse-group-staleness-"),
	);
	await fixture.write();
	await fixture.confirmations.corpus.recordGroupFrom(
		directorySource(corpus),
		"build",
	);
	await mkdir(join(corpus, "skills", "build"), { recursive: true });
	await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "build\n");

	const report = await groupStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toEqual([
		expect.objectContaining({ causes: [], stale: false }),
	]);
}

describe(groupStaleness.name, () => {
	it(
		"reports the files each frozen stage read, by layout path and hash",
		reportsTheFilesEachFrozenStageReadByLayoutPathAndHash,
	);
	it(
		"names each frozen stage corpus file that changed, with its version distance",
		namesEachFrozenStageCorpusFileThatChangedWithItsVersionDistance,
	);
	it("names a file every stage froze once", namesAFileEveryStageFrozeOnce);
	it(
		"reports the group clean at distance 0 when nothing it froze changed",
		reportsTheGroupCleanAtDistance0WhenNothingItFrozeChanged,
	);
	it(
		"reports a group frozen without its stage's own skill clean when nothing it froze changed",
		reportsAGroupFrozenWithoutItsStageSOwnSkillCleanWhenNothingItFrozeChanged,
	);
});
