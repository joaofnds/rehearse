import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { directorySource } from "./run-records-test-support";
import ReadManifestFixtures from "./staleness-manifest-test-fixtures";
import { checkpointStaleness } from "./staleness-report";
import {
	PLANNING_RUBRIC,
	discussManifest,
	planningRubricNow,
} from "./staleness-rubric-test-fixtures";

const SHA256_HEX_CHARACTERS = 64;

const SECOND_RUN_STALENESS_INDEX = 1;

const fixtures = new ReadManifestFixtures();

async function stalesACheckpointWhoseJudgeRubricChangedAndItsDownstreamStagesWithoutMovingItsDistance(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();
	await fixture.corpus.recordReadManifest(
		"discuss",
		discussManifest("0".repeat(SHA256_HEX_CHARACTERS)),
	);

	const report = await checkpointStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	const run = report.records.filter(({ id }) =>
		id.startsWith(`checkpoint:${fixture.replayableRun}/`),
	);
	expect(run).toMatchObject([
		{ stale: false },
		{
			causes: [`judge rubric ${PLANNING_RUBRIC} changed`],
			changedFiles: [],
			distance: { kind: "measured", versions: 0 },
			onlyCorpusFiles: false,
			stale: true,
		},
		{
			causes: ["upstream stage discuss is stale"],
			distance: { kind: "measured", versions: 0 },
			onlyCorpusFiles: false,
			stale: true,
		},
	]);
	expect(
		run[SECOND_RUN_STALENESS_INDEX]?.readManifest.find(
			({ half }) => half === "rubric",
		)?.state,
	).toBe("changed");
}

async function saysOfEachCorpusAndRubricEntryWhetherItChangedSinceTheRecordAndOfAProjectEntryNothing(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();
	await fixture.corpus.recordReadManifest(
		"discuss",
		discussManifest(await planningRubricNow()),
	);
	await Bun.write(join(corpus, "skills", "discuss", "SKILL.md"), "edited\n");

	const report = await checkpointStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(
		report.records
			.find(({ id }) => id === `checkpoint:${fixture.replayableRun}/discuss`)
			?.readManifest.map(({ path, half, state }) => ({ half, path, state })),
	).toEqual([
		{ half: "corpus", path: "CLAUDE.md", state: "unchanged" },
		{ half: "corpus", path: "skills/discuss/SKILL.md", state: "changed" },
		{ half: "rubric", path: PLANNING_RUBRIC, state: "unchanged" },
		{ half: "project", path: "CLAUDE.md", state: undefined },
	]);
}

afterEach(async () => {
	await fixtures.cleanup();
});

describe("staleness over read manifests", () => {
	it(
		"stales a checkpoint whose judge rubric changed, and its downstream stages, without moving its distance",
		stalesACheckpointWhoseJudgeRubricChangedAndItsDownstreamStagesWithoutMovingItsDistance,
	);

	it(
		"says of each corpus and rubric entry whether it changed since the record, and of a project entry nothing",
		saysOfEachCorpusAndRubricEntryWhetherItChangedSinceTheRecordAndOfAProjectEntryNothing,
	);
});
