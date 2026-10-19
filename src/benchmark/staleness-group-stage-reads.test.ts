import { afterEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { directorySource } from "./run-records-test-support";
import ConfirmationCorpusFixtures from "./staleness-group-test-fixtures";
import { groupStaleness } from "./staleness-report";
import {
	PLANNING_RUBRIC,
	judgeRubricEntry,
	planningRubricNow,
} from "./staleness-rubric-test-fixtures";
import { sha256Of } from "./staleness-test-files";

const FIRST_STALENESS_RECORD_INDEX = 0;

const SHA256_BYTES = 32;

const fixtures = new ConfirmationCorpusFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function stalesAStageGroupWhoseRepLoadedAFileBeyondTheFrozenCorpusThatChanged(): Promise<void> {
	const corpus = await fixtures.stageCorpus();
	const fixture = await fixtures.fixtureWithGroupFrom(corpus);
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [
			{
				evidence: "observed",
				half: "corpus",
				path: "skills/delivery/SKILL.md",
				role: "read for context",
				sha256: sha256Of("delivery\n"),
			},
		],
		repId: "rep-1",
		stage: "build",
	});
	await mkdir(join(corpus, "skills", "delivery"), { recursive: true });
	await Bun.write(join(corpus, "skills", "delivery", "SKILL.md"), "edited\n");

	const report = await groupStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toEqual([
		expect.objectContaining({
			causes: ["skills/delivery/SKILL.md changed"],
			onlyCorpusFiles: true,
			readManifest: [
				expect.objectContaining({
					path: "skills/delivery/SKILL.md",
					state: "changed",
				}),
			],
			stale: true,
		}),
	]);
	expect(
		report.records[FIRST_STALENESS_RECORD_INDEX]?.readFiles.map(
			({ path }) => path,
		),
	).toContain("skills/delivery/SKILL.md");
}

async function stalesAStageGroupWhoseRepSJudgeRubricChangedSince(): Promise<void> {
	const corpus = await fixtures.stageCorpus();
	const fixture = await fixtures.fixtureWithGroupFrom(corpus);
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [judgeRubricEntry("aa".repeat(SHA256_BYTES))],
		repId: "rep-1",
		stage: "discuss",
	});

	const report = await groupStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toEqual([
		expect.objectContaining({
			causes: [`judge rubric ${PLANNING_RUBRIC} changed`],
			onlyCorpusFiles: false,
			stale: true,
		}),
	]);
}

async function doesNotCallAStageGroupSStalenessCorpusOnlyWhenItsRepSJudgeRubricChangedToo(): Promise<void> {
	const corpus = await fixtures.stageCorpus();
	const fixture = await fixtures.fixtureWithGroupFrom(corpus);
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [judgeRubricEntry("aa".repeat(SHA256_BYTES))],
		repId: "rep-1",
		stage: "discuss",
	});
	await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");

	const report = await groupStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toEqual([
		expect.objectContaining({ onlyCorpusFiles: false, stale: true }),
	]);
}

async function judgesTheReadManifestARepSStageCheckpointHolds(): Promise<void> {
	const corpus = await fixtures.stageCorpus();
	const fixture = await fixtures.fixtureWithGroupFrom(corpus);
	await fixture.confirmations.reads.recordGroupRepCheckpointReadManifest({
		readManifest: [judgeRubricEntry("aa".repeat(SHA256_BYTES))],
		repId: "rep-1",
		stage: "discuss",
	});

	const report = await groupStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toEqual([
		expect.objectContaining({
			causes: [`judge rubric ${PLANNING_RUBRIC} changed`],
			stale: true,
		}),
	]);
}

async function keepsAStageGroupFreshWhenItsRepSJudgeRubricIsUnchanged(): Promise<void> {
	const corpus = await fixtures.stageCorpus();
	const fixture = await fixtures.fixtureWithGroupFrom(corpus);
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [judgeRubricEntry(await planningRubricNow())],
		repId: "rep-1",
		stage: "discuss",
	});

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
		"stales a stage group whose rep loaded a file beyond the frozen corpus that changed",
		stalesAStageGroupWhoseRepLoadedAFileBeyondTheFrozenCorpusThatChanged,
	);
	it(
		"stales a stage group whose rep's judge rubric changed since",
		stalesAStageGroupWhoseRepSJudgeRubricChangedSince,
	);
	it(
		"does not call a stage group's staleness corpus-only when its rep's judge rubric changed too",
		doesNotCallAStageGroupSStalenessCorpusOnlyWhenItsRepSJudgeRubricChangedToo,
	);
	it(
		"judges the read manifest a rep's stage checkpoint holds",
		judgesTheReadManifestARepSStageCheckpointHolds,
	);
	it(
		"keeps a stage group fresh when its rep's judge rubric is unchanged",
		keepsAStageGroupFreshWhenItsRepSJudgeRubricIsUnchanged,
	);
});
