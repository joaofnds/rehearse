import { describe, expect, it } from "bun:test";

import type { CorpusMeasurement } from "./corpus-measurement";
import { stageRubricSha256 } from "./judge-agreement";
import { readReplayRecord, runReplay } from "./replay";
import ReplayConfirmationHarness from "./replay-confirmation-test-support";
import ReplaySavedRunBuilder from "./replay-saved-run-test-builder";
import { ReplayRequestBuilder } from "./replay-test-fixtures";
import ReplayTranscriptRecorder from "./replay-transcript-test-fixture";
import { TestResources } from "./test-support";

const SHA256_HEX_DIGITS = 64;

const testResources = TestResources.forEachTest();
const writesARecordThatValidatesAgainstTheReplaySchema =
	async (): Promise<void> => {
		const lowerBoundForCorpusFilesCount = 0;

		const run = await new ReplaySavedRunBuilder().build(testResources);
		const fake = new ReplayConfirmationHarness();

		const outcome = await runReplay(
			fake.dependencies,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		);

		const record = await readReplayRecord(outcome.recordPath);

		expect(record.replay).toBe(true);
		expect(record.consumed.lineage).toBe(run.discuss.lineage);
		expect(record.corpusFiles.length).toBeGreaterThan(
			lowerBoundForCorpusFilesCount,
		);
		expect(record.scorecard.grade.verdict).toBe("CONTINUE");
	};
const recordsWhatTheReplayedStageDeclaredAndLoadedWith =
	async (): Promise<void> => {
		const run = await new ReplaySavedRunBuilder().build(testResources);
		const transcript = await ReplayTranscriptRecorder.create(testResources);
		const fake = new ReplayConfirmationHarness(transcript.override);

		const outcome = await runReplay(
			fake.dependencies,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		);

		const record = await readReplayRecord(outcome.recordPath);
		const read = new Map(
			record.corpusFiles.map(({ path, sha256 }) => [path, sha256]),
		);

		expect(record.readManifest).toEqual([
			{
				evidence: "declared",
				half: "corpus",
				path: "CLAUDE.md",
				role: "global instructions",
				sha256: read.get("CLAUDE.md"),
			},
			{
				evidence: "declared and observed",
				half: "corpus",
				path: "skills/build/SKILL.md",
				role: "stage skill",
				sha256: read.get("skills/build/SKILL.md"),
			},
			{
				evidence: "declared",
				half: "rubric",
				path: "rubrics/build.json",
				role: "judge rubric",
				sha256: stageRubricSha256(outcome.record.scorecard.rubric),
			},
		]);
	};
const recordsTheCorpusVersionItsStageSessionMeasured =
	async (): Promise<void> => {
		const run = await new ReplaySavedRunBuilder().build(testResources);
		const fake = new ReplayConfirmationHarness();
		const measured: CorpusMeasurement = {
			digest: "d".repeat(SHA256_HEX_DIGITS),
			kind: "version",
		};

		const outcome = await runReplay(
			{
				...fake.dependencies,
				stageSession: {
					...fake.dependencies.stageSession,
					corpusVersionFiles: async () => await Promise.resolve([]),
					measureCorpus: async () => await Promise.resolve(measured),
				},
			},
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		);
		const record = await readReplayRecord(outcome.recordPath);

		expect(record.corpusVersion).toEqual(measured);
	};
describe(runReplay.name, () => {
	describe("stage record readings", () => {
		it(
			"writes a record that validates against the replay schema",
			writesARecordThatValidatesAgainstTheReplaySchema,
		);
		it(
			"records what the replayed stage declared and loaded, with roles",
			recordsWhatTheReplayedStageDeclaredAndLoadedWith,
		);
		it(
			"records the corpus version its stage session measured",
			recordsTheCorpusVersionItsStageSessionMeasured,
		);
	});
});
