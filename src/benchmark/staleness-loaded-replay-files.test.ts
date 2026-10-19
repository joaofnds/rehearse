import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { directorySource } from "./run-records-test-support";
import {
	STYLE,
	styleEntry,
	withStyle,
} from "./staleness-loaded-file-test-fixtures";
import ReadManifestFixtures from "./staleness-manifest-test-fixtures";
import {
	checkpointStaleness,
	replayAttemptStaleness,
} from "./staleness-report";
import {
	PLANNING_RUBRIC,
	discussManifest,
	planningRubricNow,
} from "./staleness-rubric-test-fixtures";

const FIRST_STALENESS_RECORD_INDEX = 0;

const fixtures = new ReadManifestFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function stalesAReplayWhoseLoadedFileBeyondItsCapturedFilesChanged(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();
	await withStyle(corpus, "edited\n");
	await fixture.corpus.recordReplayReadManifest([styleEntry("style\n")]);

	const report = await replayAttemptStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toMatchObject([
		{
			causes: [`${STYLE} changed`],
			changedFiles: [{ change: "changed", path: STYLE }],
			onlyCorpusFiles: true,
			readManifest: [{ path: STYLE, state: "changed" }],
			stale: true,
		},
	]);
	expect(
		report.records[FIRST_STALENESS_RECORD_INDEX]?.readFiles.map(
			({ path }) => path,
		),
	).toContain(STYLE);
}

async function saysNothingOfACorpusEntryWhenTheCorpusUnderTestCannotBeRead(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();
	await fixture.corpus.recordReadManifest(
		"discuss",
		discussManifest(await planningRubricNow()),
	);
	await rm(join(corpus, "CLAUDE.md"));

	const report = await checkpointStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(
		report.records
			.find(({ id }) => id === `checkpoint:${fixture.replayableRun}/discuss`)
			?.readManifest.map(({ path, half, state }) => ({ half, path, state })),
	).toEqual([
		{ half: "corpus", path: "CLAUDE.md", state: undefined },
		{ half: "corpus", path: "skills/discuss/SKILL.md", state: undefined },
		{ half: "rubric", path: PLANNING_RUBRIC, state: "unchanged" },
		{ half: "project", path: "CLAUDE.md", state: undefined },
	]);
}

describe("staleness over read manifests", () => {
	it(
		"stales a replay whose loaded file beyond its captured files changed",
		stalesAReplayWhoseLoadedFileBeyondItsCapturedFilesChanged,
	);
	it(
		"says nothing of a corpus entry when the corpus under test cannot be read",
		saysNothingOfACorpusEntryWhenTheCorpusUnderTestCannotBeRead,
	);
});
