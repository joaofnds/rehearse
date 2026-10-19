import { afterEach, describe, expect, it } from "bun:test";

import { directorySource } from "./run-records-test-support";
import CheckpointCorpusFixtures from "./staleness-checkpoint-test-fixtures";
import { staleCheckpoints } from "./staleness-report";

const FIRST_STALENESS_RESULT_INDEX = 0;

const fixtures = new CheckpointCorpusFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function namesEveryCheckpointTheRecordedModelNoLongerMatches(): Promise<void> {
	const fixture = await fixtures.writtenFixture();
	const corpus = await fixtures.corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));

	const stale = await staleCheckpoints(
		fixture.runsDirectory,
		directorySource(corpus),
		{ model: "opus" },
	);

	expect(stale.map(({ id }) => id)).toEqual([
		`checkpoint:${fixture.replayableRun}/initial`,
		`checkpoint:${fixture.replayableRun}/discuss`,
		`checkpoint:${fixture.replayableRun}/build`,
	]);
	expect(stale.at(FIRST_STALENESS_RESULT_INDEX)?.causes).toContain(
		"model sonnet is now opus",
	);
}

async function namesEveryCheckpointTheRecordedEffortNoLongerMatches(): Promise<void> {
	const fixture = await fixtures.writtenFixture();
	const corpus = await fixtures.corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));

	const stale = await staleCheckpoints(
		fixture.runsDirectory,
		directorySource(corpus),
		{ effort: "high" },
	);

	expect(stale.at(FIRST_STALENESS_RESULT_INDEX)?.causes).toContain(
		"effort none is now high",
	);
}

describe(staleCheckpoints.name, () => {
	describe("when the session about to replay names another model", () => {
		it(
			"names every checkpoint the recorded model no longer matches",
			namesEveryCheckpointTheRecordedModelNoLongerMatches,
		);
	});
	describe("when the session about to replay names another effort", () => {
		it(
			"names every checkpoint the recorded effort no longer matches",
			namesEveryCheckpointTheRecordedEffortNoLongerMatches,
		);
	});
});
