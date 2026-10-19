import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { benchmarkRunPaths } from "./run-layout";
import { directorySource } from "./run-records-test-support";
import CheckpointChainFixtures from "./staleness-chain-test-fixtures";
import { damagedStopRecords } from "./staleness-record-test-fixtures";
import { checkpointStaleness, staleCheckpoints } from "./staleness-report";

const SHA256_HEX_DIGITS = 64;

const fixtures = new CheckpointChainFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function listsAStageItsJudgeStoppedUnderItsRunSIdWithTheFileItReadThatChangedAndItsVersionDistance(): Promise<void> {
	const { fixture, corpus } = await fixtures.stoppedStageFixture();
	await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");

	const stale = await staleCheckpoints(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(stale).toMatchObject([
		{
			causes: ["skills/build/SKILL.md changed"],
			changedFiles: [{ change: "changed", path: "skills/build/SKILL.md" }],
			distance: { kind: "measured", versions: 1 },
			id: `run:${fixture.stoppedRun}`,
			onlyCorpusFiles: true,
		},
	]);
}

async function listsAStageItsJudgeStoppedWhenTheJudgeRubricItReadChangedWithoutMovingItsDistance(): Promise<void> {
	const { fixture, corpus } = await fixtures.stoppedStageFixture();
	const rubric = "cases/audit-log/rubrics/build.json";
	const stopRecord = benchmarkRunPaths(
		fixture.runsDirectory,
		fixture.stoppedRun,
	).stageFile("build");
	const recordText = await Bun.file(stopRecord).text();
	await Bun.write(
		stopRecord,
		JSON.stringify({
			...JSON.parse(recordText),
			readManifest: [
				{
					evidence: "declared",
					half: "rubric",
					path: rubric,
					role: "judge rubric",
					sha256: "0".repeat(SHA256_HEX_DIGITS),
				},
			],
		}),
	);

	const stale = await staleCheckpoints(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(stale).toMatchObject([
		{
			causes: [`judge rubric ${rubric} changed`],
			distance: { kind: "measured", versions: 0 },
			id: `run:${fixture.stoppedRun}`,
			onlyCorpusFiles: false,
		},
	]);
}

async function reportsUnreadableStoppedStageAlongsideCheckpoints(
	_situation: string,
	damage: (stageFile: (stage: string) => string) => Promise<void>,
): Promise<void> {
	const { fixture, corpus } = await fixtures.stoppedStageFixture();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.stoppedRun);
	await damage((stage) => paths.stageFile(stage));

	const report = await checkpointStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect({
		ids: report.records.map(({ id }) => id),
		unreadable: report.unreadable.map(({ id }) => id),
	}).toEqual({
		ids: [`checkpoint:${fixture.stoppedRun}/initial`],
		unreadable: [`run:${fixture.stoppedRun}`],
	});
}

describe(checkpointStaleness.name, () => {
	it(
		"lists a stage its judge stopped, under its run's id, with the file it read that changed and its version distance",
		listsAStageItsJudgeStoppedUnderItsRunSIdWithTheFileItReadThatChangedAndItsVersionDistance,
	);
	it(
		"lists a stage its judge stopped when the judge rubric it read changed, without moving its distance",
		listsAStageItsJudgeStoppedWhenTheJudgeRubricItReadChangedWithoutMovingItsDistance,
	);
	it.each(damagedStopRecords)(
		"names its stopped stage unreadable and still judges its checkpoints when %s",
		reportsUnreadableStoppedStageAlongsideCheckpoints,
	);
});
