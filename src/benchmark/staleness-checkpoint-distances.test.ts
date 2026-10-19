import { afterEach, describe, expect, it } from "bun:test";

import { directorySource } from "./run-records-test-support";
import CheckpointChainFixtures from "./staleness-chain-test-fixtures";
import { checkpointStaleness } from "./staleness-report";

const fixtures = new CheckpointChainFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function reportsEveryCheckpointWithTheFilesItReadThatChangedAndItsVersionDistance(): Promise<void> {
	const { fixture, corpus } = await fixtures.editedFixture();

	const report = await checkpointStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(
		report.records.filter(({ id }) =>
			id.startsWith(`checkpoint:${fixture.replayableRun}/`),
		),
	).toMatchObject([
		{
			causes: [],
			changedFiles: [],
			distance: {
				kind: "not-recorded",
				reason: "the initial checkpoint reads no corpus",
			},
			id: `checkpoint:${fixture.replayableRun}/initial`,
			onlyCorpusFiles: false,
			stale: false,
		},
		{
			causes: [],
			changedFiles: [],
			distance: { kind: "measured", versions: 1 },
			id: `checkpoint:${fixture.replayableRun}/discuss`,
			onlyCorpusFiles: false,
			stale: false,
		},
		{
			causes: ["skills/build/SKILL.md changed"],
			changedFiles: [{ change: "changed", path: "skills/build/SKILL.md" }],
			distance: { kind: "measured", versions: 1 },
			id: `checkpoint:${fixture.replayableRun}/build`,
			onlyCorpusFiles: true,
			stale: true,
		},
	]);
}

describe(checkpointStaleness.name, () => {
	it(
		"reports every checkpoint with the files it read that changed and its version distance",
		reportsEveryCheckpointWithTheFilesItReadThatChangedAndItsVersionDistance,
	);
});
