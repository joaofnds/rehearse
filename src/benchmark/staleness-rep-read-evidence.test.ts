import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { confirmationGroupPaths } from "./run-layout";
import {
	RecordedRunsFixture,
	directorySource,
} from "./run-records-test-support";
import ConfirmationCorpusFixtures from "./staleness-group-test-fixtures";
import { deliveryRead } from "./staleness-loaded-file-test-fixtures";
import { groupRepReads, groupStaleness } from "./staleness-report";

const fixtures = new ConfirmationCorpusFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function judgesEachRepStageSReadsApartNamingTheRepAndTheStage(): Promise<void> {
	const corpus = await fixtures.stageCorpus();
	const fixture = await fixtures.fixtureWithGroupFrom(corpus);
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [deliveryRead("delivery\n")],
		repId: "rep-1",
		stage: "build",
	});
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [deliveryRead("edited\n")],
		repId: "rep-2",
		stage: "build",
	});
	await mkdir(join(corpus, "skills", "delivery"), { recursive: true });
	await Bun.write(join(corpus, "skills", "delivery", "SKILL.md"), "edited\n");

	const reads = await groupRepReads(
		fixture.runsDirectory,
		fixture.groupId,
		directorySource(corpus),
	);

	expect(reads).toEqual({
		reasons: [],
		reps: [
			{
				readManifest: [{ ...deliveryRead("delivery\n"), state: "changed" }],
				repId: "rep-1",
				stage: "build",
			},
			{
				readManifest: [{ ...deliveryRead("edited\n"), state: "unchanged" }],
				repId: "rep-2",
				stage: "build",
			},
		],
	});
}

async function listsTheReadsUnjudgedAndSaysWhyWhenTheGroupFrozeNoPipeline(): Promise<void> {
	const fixture = new RecordedRunsFixture(
		await fixtures.temporaryDirectory("rehearse-group-no-pipeline-"),
	);
	await fixture.write();
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [deliveryRead("delivery\n")],
		repId: "rep-1",
		stage: "build",
	});

	const reads = await groupRepReads(
		fixture.runsDirectory,
		fixture.groupId,
		directorySource(await fixtures.stageCorpus()),
	);

	expect(reads).toEqual({
		reasons: [
			"Reads not judged: the group froze no pipeline to hash its stages against",
		],
		reps: [
			{
				readManifest: [deliveryRead("delivery\n")],
				repId: "rep-1",
				stage: "build",
			},
		],
	});
}

async function namesAFrozenPipelineThatWentMissingByItsPathInTheGroup(): Promise<void> {
	const corpus = await fixtures.stageCorpus();
	const fixture = await fixtures.fixtureWithGroupFrom(corpus);
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [deliveryRead("delivery\n")],
		repId: "rep-1",
		stage: "build",
	});
	await rm(
		join(
			confirmationGroupPaths(fixture.runsDirectory, fixture.groupId)
				.inputsDirectory,
			"pipeline.json",
		),
	);

	const reads = await groupRepReads(
		fixture.runsDirectory,
		fixture.groupId,
		directorySource(corpus),
	);

	expect(reads.reasons).toEqual([
		"Reads not judged: the group's frozen pipeline inputs/pipeline.json is missing",
	]);
}

async function namesARepStageWhoseFileDoesNotParseAndStillJudgesTheOthers(): Promise<void> {
	const corpus = await fixtures.stageCorpus();
	const fixture = await fixtures.fixtureWithGroupFrom(corpus);
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [deliveryRead("delivery\n")],
		repId: "rep-1",
		stage: "build",
	});
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [],
		repId: "rep-2",
		stage: "build",
	});
	await Bun.write(
		confirmationGroupPaths(fixture.runsDirectory, fixture.groupId)
			.rep("rep-2")
			.stageFile("build"),
		"{broken",
	);

	const reads = await groupRepReads(
		fixture.runsDirectory,
		fixture.groupId,
		directorySource(corpus),
	);

	expect(reads).toEqual({
		reasons: [expect.stringMatching(/^rep-2 build could not be read: /u)],
		reps: [
			{
				readManifest: [{ ...deliveryRead("delivery\n"), state: "changed" }],
				repId: "rep-1",
				stage: "build",
			},
		],
	});
}

async function judgesASessionRepSReadsUnderItsRepWithNoStageLeavingOutARepThatReadNothing(): Promise<void> {
	const corpus = await fixtures.sessionStyleCorpus("edited\n");
	const fixture = new RecordedRunsFixture(
		await fixtures.temporaryDirectory("rehearse-session-group-"),
	);
	await fixture.confirmations.corpus.recordSessionGroupFrom({
		corpusRoot: corpus,
		groupId: "session-group",
		layoutPaths: ["output-styles/brief.md"],
	});
	await fixture.confirmations.reads.recordSessionGroupRepAttempt(
		{ groupId: "session-group", repId: "session-group-rep-1" },
		{
			corpusRoot: corpus,
			layoutPaths: ["output-styles/brief.md"],
			readManifest: [deliveryRead("delivery\n")],
		},
	);
	await fixture.confirmations.reads.recordSessionGroupRepAttempt(
		{ groupId: "session-group", repId: "session-group-rep-2" },
		{
			corpusRoot: corpus,
			layoutPaths: ["output-styles/brief.md"],
			readManifest: [],
		},
	);

	const reads = await groupRepReads(
		fixture.runsDirectory,
		"session-group",
		directorySource(corpus),
	);

	expect(reads).toEqual({
		reasons: [],
		reps: [
			{
				readManifest: [{ ...deliveryRead("delivery\n"), state: "changed" }],
				repId: "session-group-rep-1",
			},
		],
	});
}

describe(groupStaleness.name, () => {
	describe(groupRepReads.name, () => {
		it(
			"judges each rep stage's reads apart, naming the rep and the stage",
			judgesEachRepStageSReadsApartNamingTheRepAndTheStage,
		);
		it(
			"lists the reads unjudged and says why when the group froze no pipeline",
			listsTheReadsUnjudgedAndSaysWhyWhenTheGroupFrozeNoPipeline,
		);
		it(
			"names a frozen pipeline that went missing by its path in the group",
			namesAFrozenPipelineThatWentMissingByItsPathInTheGroup,
		);
		it(
			"names a rep stage whose file does not parse and still judges the others",
			namesARepStageWhoseFileDoesNotParseAndStillJudgesTheOthers,
		);
		it(
			"judges a session rep's reads under its rep with no stage, leaving out a rep that read nothing",
			judgesASessionRepSReadsUnderItsRepWithNoStageLeavingOutARepThatReadNothing,
		);
	});
});
