import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { directorySource } from "./run-records-test-support";
import { REPLAY_ATTEMPT } from "./staleness-record-test-fixtures";
import ReplayCorpusFixtures from "./staleness-replay-test-fixtures";
import { replayAttemptStaleness } from "./staleness-report";

const fixtures = new ReplayCorpusFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function namesEachStageCorpusFileTheReplayReadThatChangedWithItsVersionDistance(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();
	await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");

	const report = await replayAttemptStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report).toEqual({
		records: [
			expect.objectContaining({
				causes: ["skills/build/SKILL.md changed"],
				changedFiles: [{ change: "changed", path: "skills/build/SKILL.md" }],
				distance: { kind: "measured", versions: 1 },
				id: REPLAY_ATTEMPT,
				onlyCorpusFiles: true,
				stale: true,
			}),
		],
		unreadable: [],
	});
}

async function reportsTheReplayCleanAtDistance0WhenNothingItReadChanged(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();

	const report = await replayAttemptStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toEqual([
		expect.objectContaining({
			causes: [],
			changedFiles: [],
			distance: { kind: "measured", versions: 0 },
			id: REPLAY_ATTEMPT,
			onlyCorpusFiles: false,
			stale: false,
		}),
	]);
}

async function stalesTheReplayWhenTheCheckpointItConsumedWentStale(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();
	await Bun.write(join(corpus, "skills", "discuss", "SKILL.md"), "edited\n");

	const report = await replayAttemptStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records.map(({ causes }) => causes)).toEqual([
		["upstream stage discuss is stale"],
	]);
}

async function stalesTheReplayOnAModelTheCallerNamesThatDiffersFromItsOwn(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();

	const report = await replayAttemptStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
		{ model: "opus" },
	);

	expect(report.records.map(({ causes }) => causes)).toEqual([
		["model sonnet is now opus"],
	]);
}

describe(replayAttemptStaleness.name, () => {
	it(
		"names each stage corpus file the replay read that changed, with its version distance",
		namesEachStageCorpusFileTheReplayReadThatChangedWithItsVersionDistance,
	);
	it(
		"reports the replay clean at distance 0 when nothing it read changed",
		reportsTheReplayCleanAtDistance0WhenNothingItReadChanged,
	);
	it(
		"stales the replay when the checkpoint it consumed went stale",
		stalesTheReplayWhenTheCheckpointItConsumedWentStale,
	);
	it(
		"stales the replay on a model the caller names that differs from its own",
		stalesTheReplayOnAModelTheCallerNamesThatDiffersFromItsOwn,
	);
});
