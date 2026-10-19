import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import { stageRubricSha256 } from "./judge-agreement";
import { runReplay } from "./replay";
import ReplayCorpusBuilder from "./replay-confirmation-corpus-test-builder";
import ReplayConfirmationHarness from "./replay-confirmation-test-support";
import ReplaySavedRunBuilder from "./replay-saved-run-test-builder";
import { ReplayRequestBuilder } from "./replay-test-fixtures";
import { loadStageRubric } from "./stage-rubric";
import { TestResources } from "./test-support";

const SHA256_BYTES = 32;
const PLANNING_RUBRIC = "cases/audit-log/rubrics/shape.json";

const testResources = TestResources.forEachTest();
const recordsTheReplayFreshWhenAFileTheUpstream = async (): Promise<void> => {
	const corpus = await new ReplayCorpusBuilder({
		files: [{ content: "shape", path: "skills/shape/SKILL.md" }],
		prefix: "rehearse-replaycorpus-",
	}).build(testResources);
	const run = await new ReplaySavedRunBuilder({
		discussCorpus: [
			{
				path: "skills/discuss/SKILL.md",
				sha256: createHash("sha256").update("discuss").digest("hex"),
			},
		],
		discussReads: [
			{
				evidence: "observed",
				half: "corpus",
				path: "skills/shape/SKILL.md",
				role: "read for context",
				sha256: createHash("sha256").update("shape").digest("hex"),
			},
		],
	}).build(testResources);
	const fake = new ReplayConfirmationHarness();

	const outcome = await runReplay(fake.dependencies, {
		...new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		corpusSource: { backingRoot: corpus, kind: "live", root: corpus },
	});

	expect(outcome.record.staleness).toEqual([]);
};
const recordsTheReplayStaleAndNamesTheChangedUpstream =
	async (): Promise<void> => {
		const run = await new ReplaySavedRunBuilder({
			discussCorpus: [
				{ path: "skills/discuss/SKILL.md", sha256: "aa".repeat(SHA256_BYTES) },
			],
		}).build(testResources);
		const fake = new ReplayConfirmationHarness();

		const outcome = await runReplay(
			fake.dependencies,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		);

		expect(outcome.record.stale).toBe(true);
		expect(outcome.record.staleness).toEqual([
			{ causes: ["skills/discuss/SKILL.md changed"], stage: "discuss" },
		]);
	};
const recordsTheReplayStaleWhenItsUpstreamStagesJudge =
	async (): Promise<void> => {
		const run = await new ReplaySavedRunBuilder({
			judgeRubricSha256: "aa".repeat(SHA256_BYTES),
		}).build(testResources);
		const fake = new ReplayConfirmationHarness();

		const outcome = await runReplay(
			fake.dependencies,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		);

		expect(outcome.record.stale).toBe(true);
		expect(outcome.record.staleness).toEqual([
			{ causes: [`judge rubric ${PLANNING_RUBRIC} changed`], stage: "discuss" },
		]);
	};
const recordsTheReplayFreshWhenItsUpstreamStagesJudge =
	async (): Promise<void> => {
		const loaded = await loadStageRubric({
			kind: "planning",
			name: "discuss",
			requiresAcceptanceCriteria: false,
			rubric: PLANNING_RUBRIC,
			skill: "discuss",
		});
		const run = await new ReplaySavedRunBuilder({
			judgeRubricSha256: stageRubricSha256(loaded.rubric),
		}).build(testResources);
		const fake = new ReplayConfirmationHarness();

		const outcome = await runReplay(
			fake.dependencies,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		);

		expect(outcome.record.stale).toBe(false);
	};
describe(runReplay.name, () => {
	describe("upstream file and rubric staleness", () => {
		it(
			"records the replay fresh when a file the upstream stage loaded beyond its corpus is unchanged",
			recordsTheReplayFreshWhenAFileTheUpstream,
		);
		it(
			"records the replay stale and names the changed upstream file",
			recordsTheReplayStaleAndNamesTheChangedUpstream,
		);
		it(
			"records the replay stale when its upstream stage's judge rubric changed",
			recordsTheReplayStaleWhenItsUpstreamStagesJudge,
		);
		it(
			"records the replay fresh when its upstream stage's judge rubric is unchanged",
			recordsTheReplayFreshWhenItsUpstreamStagesJudge,
		);
	});
});
