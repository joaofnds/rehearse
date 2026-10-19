import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import { corpusLayoutRoots } from "./checkpoint";
import { readReplayRecord, runReplay } from "./replay";
import ReplayConfirmationHarness from "./replay-confirmation-test-support";
import ReplaySavedRunBuilder from "./replay-saved-run-test-builder";
import { ReplayRequestBuilder } from "./replay-test-fixtures";
import { TestResources } from "./test-support";

const FIRST_CREATED_WORKTREE_INDEX = 0;
const FIRST_STALE_STAGE_INDEX = 0;
const SHA256_BYTES = 32;

const testResources = TestResources.forEachTest();
const recordsTheReplayFreshWhenTheCorpusStillMatches =
	async (): Promise<void> => {
		const run = await new ReplaySavedRunBuilder({
			discussCorpus: [
				{
					path: "skills/discuss/SKILL.md",
					sha256: createHash("sha256").update("discuss").digest("hex"),
				},
			],
		}).build(testResources);
		const fake = new ReplayConfirmationHarness();

		const outcome = await runReplay(
			fake.dependencies,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		);

		expect(outcome.record.stale).toBe(false);
		expect(outcome.record.staleness).toEqual([]);
	};
const printsWhenTheCheckpointChainIsFresh = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder({
		discussCorpus: [
			{
				path: "skills/discuss/SKILL.md",
				sha256: createHash("sha256").update("discuss").digest("hex"),
			},
		],
	}).build(testResources);
	const fake = new ReplayConfirmationHarness();

	await runReplay(
		fake.dependencies,
		new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
	);

	expect(
		fake.log.filter((line) => line === "Checkpoint chain is fresh"),
	).toEqual(["Checkpoint chain is fresh"]);
};
const derivesStalenessFromTheRequestsInstructionsAndTheWorktrees =
	async (): Promise<void> => {
		const run = await new ReplaySavedRunBuilder({
			discussCorpus: [
				{
					path: "skills/discuss/SKILL.md",
					sha256: createHash("sha256").update("discuss").digest("hex"),
				},
			],
		}).build(testResources);
		const fake = new ReplayConfirmationHarness();

		await runReplay(
			fake.dependencies,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		);

		const worktree =
			fake.worktrees[FIRST_CREATED_WORKTREE_INDEX]?.path ?? "missing";
		const upstream = fake.corpusCaptures.find(
			({ skill }) => skill === "discuss",
		);

		expect(upstream?.instructions).toBe("Current instructions");
		expect(upstream?.roots).toEqual(
			corpusLayoutRoots(worktree, {
				backingRoot: "/backing",
				kind: "live",
				root: "/live",
			}),
		);
	};
const printsEveryStaleCheckpointWhenTheChainIsStale =
	async (): Promise<void> => {
		const run = await new ReplaySavedRunBuilder({
			discussCorpus: [
				{ path: "skills/discuss/SKILL.md", sha256: "aa".repeat(SHA256_BYTES) },
			],
		}).build(testResources);
		const fake = new ReplayConfirmationHarness();

		await runReplay(
			fake.dependencies,
			new ReplayRequestBuilder({ stage: "review" }).build(run.paths),
		);

		expect(
			fake.log.filter(
				(line) =>
					line === "Checkpoint chain is fresh" ||
					line.startsWith("Stale checkpoint "),
			),
		).toEqual([
			"Stale checkpoint discuss: skills/discuss/SKILL.md changed",
			"Stale checkpoint build: upstream stage discuss is stale",
		]);
	};
const labelsTheReplayStaleWhenTheModelDiffersFrom = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder().build(testResources);
	const fake = new ReplayConfirmationHarness();

	const outcome = await runReplay(fake.dependencies, {
		...new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		model: "opus",
	});

	expect(outcome.record.stale).toBe(true);
	expect(outcome.record.staleness?.[FIRST_STALE_STAGE_INDEX]?.causes).toContain(
		"model sonnet is now opus",
	);
};
const leavesTheReplayFreshWhenOnlyTheReplayedStages =
	async (): Promise<void> => {
		const run = await new ReplaySavedRunBuilder({
			discussCorpus: [
				{
					path: "skills/discuss/SKILL.md",
					sha256: createHash("sha256").update("discuss").digest("hex"),
				},
			],
		}).build(testResources);
		const fake = new ReplayConfirmationHarness();

		const outcome = await runReplay(
			fake.dependencies,
			new ReplayRequestBuilder({ stage: "discuss" }).build(run.paths),
		);

		expect(outcome.record.stale).toBe(false);
	};
const writesAStaleRecordThatStillValidatesAgainstThe =
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

		const record = await readReplayRecord(outcome.recordPath);

		expect(record.stale).toBe(true);
		expect(record.staleness?.[FIRST_STALE_STAGE_INDEX]?.stage).toBe("discuss");
	};
describe(runReplay.name, () => {
	describe("checkpoint staleness", () => {
		it(
			"records the replay fresh when the corpus still matches the chain",
			recordsTheReplayFreshWhenTheCorpusStillMatches,
		);
		it(
			"prints when the checkpoint chain is fresh",
			printsWhenTheCheckpointChainIsFresh,
		);
		it(
			"derives staleness from the request's instructions and the worktree's skills",
			derivesStalenessFromTheRequestsInstructionsAndTheWorktrees,
		);
		it(
			"prints every stale checkpoint when the chain is stale",
			printsEveryStaleCheckpointWhenTheChainIsStale,
		);
		it(
			"labels the replay stale when the model differs from the recorded run",
			labelsTheReplayStaleWhenTheModelDiffersFrom,
		);
		it(
			"leaves the replay fresh when only the replayed stage's own skill changed",
			leavesTheReplayFreshWhenOnlyTheReplayedStages,
		);
		it(
			"writes a stale record that still validates against the replay schema",
			writesAStaleRecordThatStillValidatesAgainstThe,
		);
	});
});
