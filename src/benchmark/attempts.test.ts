import { describe, expect, it } from "bun:test";

import AttemptFilesBuilder from "./attempt-files-test-builder";
import AttemptScorecardBuilder from "./attempt-scorecard-test-builder";
import { loadAttempts, presentAttempts } from "./attempts";
import ReplayAttemptRecordBuilder from "./replay-attempt-record-test-builder";
import { TestResources } from "./test-support";

const EXPECTED_SECOND_ATTEMPT_JUDGE_COST_USD = 0.3;
const FIRST_CAPTURED_CORPUS_FILE_INDEX = 0;
const SHA256_BYTES = 32;
const FIXTURE_JSON_INDENT_SPACES = 2;
const LINEAGE = "lineage-1";
const expectedJudgeCostUsd = 1.1;
const expectedTotalCostUsd = 1.2;
const testResources = TestResources.forEachTest();
const presentsTheOriginalResultAndEachReplayAsOneAttemptList =
	async (): Promise<void> => {
		const paths = await new AttemptFilesBuilder().build(testResources);

		const attempts = await loadAttempts(paths, "discuss", LINEAGE);

		expect(attempts.map(({ label }) => label)).toEqual([
			"original run run1",
			"replay 2026-08-30T10:00:00.000Z",
		]);
		const [observedFirstAttempt, observedSecondAttempt] = attempts;

		expect(observedFirstAttempt?.grade).toBe("B");
		expect(observedSecondAttempt?.grade).toBe("A");
		expect(observedFirstAttempt?.judgeCostUsd).toBeCloseTo(
			expectedJudgeCostUsd,
		);
		expect(observedFirstAttempt?.totalCostUsd).toBeUndefined();
		expect(observedSecondAttempt?.judgeCostUsd).toBeCloseTo(
			EXPECTED_SECOND_ATTEMPT_JUDGE_COST_USD,
		);
		expect(observedSecondAttempt?.totalCostUsd).toBeCloseTo(
			expectedTotalCostUsd,
		);
	};

const countsTheWordsOfEachAttemptsArtifactTheOriginalsAndEachReplays =
	async (): Promise<void> => {
		const paths = await new AttemptFilesBuilder().build(testResources);
		await Bun.write(
			paths.replayRecordFile(LINEAGE, "2026-08-30T11:00:00.000Z"),
			`${JSON.stringify(new ReplayAttemptRecordBuilder({ timestamp: "2026-08-30T11:00:00.000Z" }).withArtifactContent("a longer new spec\n").build(), null, FIXTURE_JSON_INDENT_SPACES)}\n`,
		);

		const attempts = await loadAttempts(paths, "discuss", LINEAGE);

		expect(attempts.map(({ words }) => words)).toEqual([
			{ state: "available", words: 2 },
			{ state: "available", words: 2 },
			{ state: "available", words: 4 },
		]);
	};

const skipsAnOriginalStageFileThatNeverReachedAGrade =
	async (): Promise<void> => {
		const paths = await new AttemptFilesBuilder().build(testResources);
		await Bun.write(
			paths.stageFile("discuss"),
			`${JSON.stringify({ stage: "discuss", status: "AWAITING_STAGE_JUDGE" })}\n`,
		);

		const attempts = await loadAttempts(paths, "discuss", LINEAGE);

		expect(attempts.map(({ label }) => label)).toEqual([
			"replay 2026-08-30T10:00:00.000Z",
		]);
	};

const returnsOnlyTheOriginalWhenTheCheckpointHasNoReplaysYet =
	async (): Promise<void> => {
		const expectedAttemptCount = 1;

		const paths = await new AttemptFilesBuilder().build(testResources);

		const attempts = await loadAttempts(paths, "discuss", "other");

		expect(attempts).toHaveLength(expectedAttemptCount);
	};

const carriesEachReplaysOwnCorpusModelAndEffortForTheComparisonGuard =
	async (): Promise<void> => {
		const paths = await new AttemptFilesBuilder().build(testResources);

		const attempts = await loadAttempts(paths, "discuss", LINEAGE);

		const [, observedSecondAttempt] = attempts;

		expect(observedSecondAttempt?.lineageInputs).toEqual({
			corpusFiles: [{ path: "CLAUDE.md", sha256: "aa".repeat(SHA256_BYTES) }],
			effort: undefined,
			model: "sonnet",
		});
	};

const carriesACurrentOriginalStageFilesCorpusModelAndEffortForThe =
	async (): Promise<void> => {
		const paths = await new AttemptFilesBuilder().build(testResources);
		await Bun.write(
			paths.stageFile("discuss"),
			`${JSON.stringify({
				...new AttemptScorecardBuilder().build(),
				corpusFiles: [{ path: "CLAUDE.md", sha256: "bb".repeat(SHA256_BYTES) }],
				effort: "high",
				model: "opus",
			})}\n`,
		);

		const attempts = await loadAttempts(paths, "discuss", LINEAGE);

		const [observedFirstAttempt] = attempts;

		expect(observedFirstAttempt?.lineageInputs).toEqual({
			corpusFiles: [{ path: "CLAUDE.md", sha256: "bb".repeat(SHA256_BYTES) }],
			effort: "high",
			model: "opus",
		});
	};

const loadsAndPresentsALegacyOriginalStageFileBesideAReplayWithout =
	async (): Promise<void> => {
		const paths = await new AttemptFilesBuilder().build(testResources);

		const attempts = await loadAttempts(paths, "discuss", LINEAGE);
		const output = await presentAttempts(
			LINEAGE,
			attempts,
			async () => await Promise.resolve("diff"),
		);

		const [observedFirstAttempt] = attempts;

		expect(observedFirstAttempt?.lineageInputs).toBeUndefined();
		expect(output).toContain("original run run1");
		expect(output).toContain("replay 2026-08-30T10:00:00.000Z");
	};

const presentsALoadedOriginalAndReplayWhoseCorporaDifferNamingTheChanged =
	async (): Promise<void> => {
		const paths = await new AttemptFilesBuilder().build(testResources);
		const originalCorpus = [
			{ path: "CLAUDE.md", sha256: "aa".repeat(SHA256_BYTES) },
			{ path: "skills/discuss/SKILL.md", sha256: "bb".repeat(SHA256_BYTES) },
		];
		await Bun.write(
			paths.stageFile("discuss"),
			`${JSON.stringify({
				...new AttemptScorecardBuilder().build(),
				corpusFiles: originalCorpus,
				model: "sonnet",
			})}\n`,
		);
		await Bun.write(
			paths.replayRecordFile(LINEAGE, "2026-08-30T10:00:00.000Z"),
			`${JSON.stringify({
				...new ReplayAttemptRecordBuilder({
					timestamp: "2026-08-30T10:00:00.000Z",
				})
					.withArtifactContent("new spec\n")
					.build(),
				corpusFiles: [
					originalCorpus[FIRST_CAPTURED_CORPUS_FILE_INDEX],
					{
						path: "skills/discuss/SKILL.md",
						sha256: "cc".repeat(SHA256_BYTES),
					},
				],
			})}\n`,
		);

		const attempts = await loadAttempts(paths, "discuss", LINEAGE);
		const output = await presentAttempts(
			LINEAGE,
			attempts,
			async () => await Promise.resolve("diff"),
		);

		expect(output).toContain("skills/discuss/SKILL.md differs");
	};
describe(loadAttempts.name, () => {
	it(
		"presents the original result and each replay as one attempt list",
		presentsTheOriginalResultAndEachReplayAsOneAttemptList,
	);
	it(
		"counts the words of each attempt's artifact, the original's and each replay's",
		countsTheWordsOfEachAttemptsArtifactTheOriginalsAndEachReplays,
	);
	it(
		"skips an original stage file that never reached a grade",
		skipsAnOriginalStageFileThatNeverReachedAGrade,
	);
	it(
		"returns only the original when the checkpoint has no replays yet",
		returnsOnlyTheOriginalWhenTheCheckpointHasNoReplaysYet,
	);
	it(
		"carries each replay's own corpus, model, and effort for the comparison guard",
		carriesEachReplaysOwnCorpusModelAndEffortForTheComparisonGuard,
	);
	it(
		"carries a current original stage file's corpus, model, and effort for the comparison guard",
		carriesACurrentOriginalStageFilesCorpusModelAndEffortForThe,
	);
	it(
		"loads and presents a legacy original stage file beside a replay without guarding it",
		loadsAndPresentsALegacyOriginalStageFileBesideAReplayWithout,
	);
	it(
		"presents a loaded original and replay whose corpora differ, naming the changed file",
		presentsALoadedOriginalAndReplayWhoseCorporaDifferNamingTheChanged,
	);
});
