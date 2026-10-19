import { afterEach, describe, expect, it } from "bun:test";

import { directorySource } from "./run-records-test-support";
import CheckpointCorpusFixtures from "./staleness-checkpoint-test-fixtures";
import { staleCheckpoints } from "./staleness-report";

const FIRST_STALENESS_RESULT_INDEX = 0;

const fixtures = new CheckpointCorpusFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function namesTheStageWhoseRecordedCorpusNoLongerMatchesWithItsCause(): Promise<void> {
	const fixture = await fixtures.writtenFixture();
	const corpus = await fixtures.corpusDirectory("build skill, edited\n");
	await fixture.corpus.recordCorpusFrom(
		directorySource(await fixtures.corpusDirectory("build skill\n")),
	);

	const stale = await staleCheckpoints(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(stale.map(({ id }) => id)).toEqual([
		`checkpoint:${fixture.replayableRun}/build`,
	]);
	expect(stale.at(FIRST_STALENESS_RESULT_INDEX)?.causes.join(" ")).toContain(
		"skills/build/SKILL.md",
	);
}

async function namesNoCheckpointWhenTheCorpusStillHoldsTheRecordedBytes(): Promise<void> {
	const fixture = await fixtures.writtenFixture();
	const corpus = await fixtures.corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));

	const stale = await staleCheckpoints(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(stale).toEqual([]);
}

describe(staleCheckpoints.name, () => {
	it(
		"names the stage whose recorded corpus no longer matches, with its cause",
		namesTheStageWhoseRecordedCorpusNoLongerMatchesWithItsCause,
	);
	it(
		"names no checkpoint when the corpus still holds the recorded bytes",
		namesNoCheckpointWhenTheCorpusStillHoldsTheRecordedBytes,
	);
});
