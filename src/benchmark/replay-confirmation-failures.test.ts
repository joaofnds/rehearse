import { describe, expect, it } from "bun:test";
import { dirname } from "node:path";

import type { ConfirmationRepRecord } from "./confirmation-record";
import { confirmationRepRecordSchema } from "./confirmation-record";
import runReplayConfirmation from "./replay-confirmation";
import ReplayCorpusBuilder from "./replay-confirmation-corpus-test-builder";
import ReplayConfirmationFixtureBuilder from "./replay-confirmation-fixture-builder";
import ReplayPaidProvider from "./replay-confirmation-paid-provider-test-fixture";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

function parseConfirmationRepRecord(text: string): ConfirmationRepRecord {
	return confirmationRepRecordSchema.parse(JSON.parse(text));
}

const retainsCompletedStageEvidenceWhenTheJudgeInvocationFails =
	async (): Promise<void> => {
		const { harness: fake, run: recorded } =
			await new ReplayConfirmationFixtureBuilder().build(testResources);
		const provider = new ReplayPaidProvider(recorded.manifest);
		const corpusRoot = await new ReplayCorpusBuilder({
			files: [
				{ content: "discuss\n", path: "skills/discuss/SKILL.md" },
				{ content: "doctrine\n", path: "skills/doctrine/SKILL.md" },
			],
			prefix: "replay-judge-corpus-",
		}).build(testResources);

		const { dependencies: replayDependencies, request: replayRequest } =
			fake.prepareConfirmation(
				{
					corpusRoots: [{ kind: "directory", root: corpusRoot }],
					paths: recorded.paths,
				},
				{ groupId: "judge-execution-evidence", reps: 2 },
				provider.override,
				provider.ownerOverride,
				ReplayPaidProvider.judgeExecutionFailure,
			);

		const outcome = await runReplayConfirmation(
			replayDependencies,
			replayRequest,
		);
		const [recordFile] = outcome.repRecordFiles;
		const record = parseConfirmationRepRecord(
			await Bun.file(recordFile ?? "missing").text(),
		);
		testResources.track(dirname(record.worktreePath));

		expect(record.metrics).toEqual({
			calls: [
				{ metrics: provider.metric, role: "worker" },
				{ metrics: provider.metric, role: "product-owner" },
			],
			missing: ["stage-judge call metrics"],
			status: "MISSING",
		});
		expect(record.workerTrajectorySteps).toBe(provider.metric.turns);
	};

const retainsTheAttemptAStageJudgePaidForWhenThe = async (): Promise<void> => {
	const { harness: fake, run: recorded } =
		await new ReplayConfirmationFixtureBuilder().build(testResources);
	const provider = new ReplayPaidProvider(recorded.manifest);
	const corpusRoot = await new ReplayCorpusBuilder({
		files: [
			{ content: "discuss\n", path: "skills/discuss/SKILL.md" },
			{ content: "doctrine\n", path: "skills/doctrine/SKILL.md" },
		],
		prefix: "replay-ceiling-corpus-",
	}).build(testResources);

	const { dependencies: replayDependencies, request: replayRequest } =
		fake.prepareConfirmation(
			{
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
				paths: recorded.paths,
			},
			{ groupId: "judge-ceiling-evidence", reps: 2 },
			provider.override,
			provider.judgeCeilingFailure,
		);

	const outcome = await runReplayConfirmation(
		replayDependencies,
		replayRequest,
	);
	const [recordFile] = outcome.repRecordFiles;
	const record = parseConfirmationRepRecord(
		await Bun.file(recordFile ?? "missing").text(),
	);
	testResources.track(dirname(record.worktreePath));

	expect(record.metrics.calls).toEqual([
		{ metrics: provider.metric, role: "worker" },
		{ metrics: provider.metric, role: "stage-judge" },
	]);
};

const retainsTheCallsAStageSessionCarriedOutOfIts = async (): Promise<void> => {
	const { harness: fake, run: recorded } =
		await new ReplayConfirmationFixtureBuilder().build(testResources);
	const provider = new ReplayPaidProvider(recorded.manifest);
	const corpusRoot = await new ReplayCorpusBuilder({
		files: [
			{ content: "discuss\n", path: "skills/discuss/SKILL.md" },
			{ content: "doctrine\n", path: "skills/doctrine/SKILL.md" },
		],
		prefix: "replay-session-corpus-",
	}).build(testResources);

	const { dependencies: replayDependencies, request: replayRequest } =
		fake.prepareConfirmation(
			{
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
				paths: recorded.paths,
			},
			{ groupId: "stage-session-evidence", reps: 2 },
			provider.override,
			provider.ownerOverride,
			provider.stageSessionFailure,
		);

	const outcome = await runReplayConfirmation(
		replayDependencies,
		replayRequest,
	);
	const [recordFile] = outcome.repRecordFiles;
	const record = parseConfirmationRepRecord(
		await Bun.file(recordFile ?? "missing").text(),
	);
	testResources.track(dirname(record.worktreePath));

	expect(record.metrics.calls).toEqual([
		{ metrics: provider.metric, role: "worker" },
		{ metrics: provider.metric, role: "product-owner" },
	]);
};

const retainsAReturnedSessionsCallsWhenAStepAfterIt =
	async (): Promise<void> => {
		const { harness: fake, run: recorded } =
			await new ReplayConfirmationFixtureBuilder().build(testResources);
		const provider = new ReplayPaidProvider(recorded.manifest);
		const corpusRoot = await new ReplayCorpusBuilder({
			files: [
				{ content: "discuss\n", path: "skills/discuss/SKILL.md" },
				{ content: "doctrine\n", path: "skills/doctrine/SKILL.md" },
			],
			prefix: "replay-delivery-corpus-",
		}).build(testResources);

		const { dependencies: replayDependencies, request: replayRequest } =
			fake.prepareConfirmation(
				{
					corpusRoots: [{ kind: "directory", root: corpusRoot }],
					paths: recorded.paths,
				},
				{ groupId: "post-session-evidence", reps: 2 },
				provider.override,
				ReplayPaidProvider.postSessionFailure,
			);

		const outcome = await runReplayConfirmation(
			replayDependencies,
			replayRequest,
		);
		const [recordFile] = outcome.repRecordFiles;
		const record = parseConfirmationRepRecord(
			await Bun.file(recordFile ?? "missing").text(),
		);
		testResources.track(dirname(record.worktreePath));

		expect(record.metrics.calls).toEqual([
			{ metrics: provider.metric, role: "worker" },
		]);
	};
describe(runReplayConfirmation.name, () => {
	describe("paid failure evidence", () => {
		it(
			"retains completed stage evidence when the Judge invocation fails",
			retainsCompletedStageEvidenceWhenTheJudgeInvocationFails,
		);

		it(
			"retains the attempt a stage Judge paid for when the ceiling refuses its retry",
			retainsTheAttemptAStageJudgePaidForWhenThe,
		);

		it(
			"retains the calls a stage session carried out of its failure",
			retainsTheCallsAStageSessionCarriedOutOfIts,
		);

		it(
			"retains a returned session's calls when a step after it fails",
			retainsAReturnedSessionsCallsWhenAStepAfterIt,
		);
	});
});
