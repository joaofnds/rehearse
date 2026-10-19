import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { directorySource } from "./run-records-test-support";
import ReadManifestFixtures from "./staleness-manifest-test-fixtures";
import { replayAttemptStaleness } from "./staleness-report";
import {
	DELIVERY_RUBRIC,
	deliveryRubricEntry,
	deliveryRubricNow,
	discussManifest,
} from "./staleness-rubric-test-fixtures";

const SHA256_HEX_CHARACTERS = 64;

const fixtures = new ReadManifestFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function judgesAReplaySJudgeRubricUnchangedWhileItStillHashesAsRecorded(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();
	await fixture.corpus.recordReplayReadManifest([
		deliveryRubricEntry(await deliveryRubricNow()),
	]);

	const report = await replayAttemptStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toMatchObject([
		{
			causes: [],
			readManifest: [{ path: DELIVERY_RUBRIC, state: "unchanged" }],
			stale: false,
		},
	]);
}

async function stalesAReplayWhoseJudgeRubricChangedWithoutMovingItsDistance(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();
	await fixture.corpus.recordReplayReadManifest([
		deliveryRubricEntry("0".repeat(SHA256_HEX_CHARACTERS)),
	]);

	const report = await replayAttemptStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toMatchObject([
		{
			causes: [`judge rubric ${DELIVERY_RUBRIC} changed`],
			distance: { kind: "measured", versions: 0 },
			onlyCorpusFiles: false,
			readManifest: [{ path: DELIVERY_RUBRIC, state: "changed" }],
			stale: true,
		},
	]);
}

async function doesNotReadAReplayAsStaleOnlyByCorpusFilesWhenItsOwnJudgeRubricChangedToo(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();
	await fixture.corpus.recordReplayReadManifest([
		deliveryRubricEntry("0".repeat(SHA256_HEX_CHARACTERS)),
	]);
	await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");

	const report = await replayAttemptStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toMatchObject([
		{ onlyCorpusFiles: false, stale: true },
	]);
}

async function stalesAReplayWhoseConsumedStageHadItsJudgeRubricChange(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();
	await fixture.corpus.recordReadManifest(
		"discuss",
		discussManifest("0".repeat(SHA256_HEX_CHARACTERS)),
	);

	const report = await replayAttemptStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toMatchObject([
		{
			causes: ["upstream stage discuss is stale"],
			onlyCorpusFiles: false,
			stale: true,
		},
	]);
}

async function doesNotReadAReplayAsStaleOnlyByCorpusFilesWhenItsConsumedStageAlsoHadItsJudgeRubricChange(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();
	await fixture.corpus.recordReadManifest(
		"discuss",
		discussManifest("0".repeat(SHA256_HEX_CHARACTERS)),
	);
	await Bun.write(join(corpus, "skills", "discuss", "SKILL.md"), "edited\n");
	await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");

	const report = await replayAttemptStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toMatchObject([
		{ onlyCorpusFiles: false, stale: true },
	]);
}

describe("staleness over read manifests", () => {
	it(
		"judges a replay's judge rubric unchanged while it still hashes as recorded",
		judgesAReplaySJudgeRubricUnchangedWhileItStillHashesAsRecorded,
	);
	it(
		"stales a replay whose judge rubric changed without moving its distance",
		stalesAReplayWhoseJudgeRubricChangedWithoutMovingItsDistance,
	);
	it(
		"does not read a replay as stale only by corpus files when its own judge rubric changed too",
		doesNotReadAReplayAsStaleOnlyByCorpusFilesWhenItsOwnJudgeRubricChangedToo,
	);
	it(
		"stales a replay whose consumed stage had its judge rubric change",
		stalesAReplayWhoseConsumedStageHadItsJudgeRubricChange,
	);
	it(
		"does not read a replay as stale only by corpus files when its consumed stage also had its judge rubric change",
		doesNotReadAReplayAsStaleOnlyByCorpusFilesWhenItsConsumedStageAlsoHadItsJudgeRubricChange,
	);
});
