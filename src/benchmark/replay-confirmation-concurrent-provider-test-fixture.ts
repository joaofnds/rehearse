import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { captureStageCorpus } from "./checkpoint";
import type { ClaudeCallMetrics, StageScorecard } from "./contracts";
import type { ReplayDependencies } from "./replay";
import {
	FROZEN_REPLAY_RUBRIC,
	readConsumedReplayInput,
} from "./replay-confirmation-concurrent-test-builder";
import { replayScorecard } from "./replay-confirmation-stage-test-harness";
import ReplayConfirmationHarness from "./replay-confirmation-test-support";
import type { ReplayDependencyOverride } from "./replay-confirmation-test-support";
import { REAL_REPLAY_WORKTREES } from "./replay-confirmation-worktree-test-fixtures";
import { harnessResult } from "./test-support";

const SESSION_NUMBER_BASE = 1;
const CONCURRENT_REPLAY_INPUT_COUNT = 3;

class ReplayConcurrentProvider extends ReplayConfirmationHarness {
	public readonly metric: ClaudeCallMetrics = {
		cacheReadTokens: 30,
		cacheWriteTokens: 40,
		costUsd: 0.25,
		inputTokens: 100,
		outputTokens: 20,
		turns: 2,
	};
	public readonly allStarted = Promise.withResolvers<boolean>();
	public readonly release = Promise.withResolvers<boolean>();
	public readonly consumedInputs: Awaited<
		ReturnType<typeof readConsumedReplayInput>
	>[] = [];
	public readonly runWorkflowStage: ReplayDependencies["stageSession"]["runWorkflowStage"] =
		async (workflowRequest) => {
			const ordinal = this.consumedInputs.push(
				await readConsumedReplayInput(workflowRequest),
			);
			if (this.consumedInputs.length === CONCURRENT_REPLAY_INPUT_COUNT) {
				this.allStarted.resolve(true);
			}
			await this.release.promise;
			await mkdir(join(workflowRequest.targetDir, "backlog", "docs"), {
				recursive: true,
			});
			await Bun.write(
				join(workflowRequest.targetDir, "backlog", "docs", "DOC-1 - spec.md"),
				"confirmed spec\n",
			);

			return {
				costUsd: this.metric.costUsd,
				exchanges: [],
				providerCalls: [{ metrics: this.metric }],
				sessionId: `session-${ordinal}`,
				stage: workflowRequest.stage,
			};
		};
	public readonly runStageJudge: ReplayDependencies["runStageJudge"] = async (
		_execution,
		{ input, source },
	) => {
		const target =
			this.consumedInputs[
				Number(input.transcript.sessionId.replace("session-", "")) -
					SESSION_NUMBER_BASE
			];
		if (target !== undefined) {
			target.rubric = source.content;
		}

		return await Promise.resolve<StageScorecard>({
			...replayScorecard(input),
			attempts: [
				{
					costUsd: this.metric.costUsd,
					metrics: this.metric,
					outcome: "ACCEPTED",
					payload: { summary: "accepted" },
				},
			],
			rubric: source.rubric,
			rubricPath: source.rubricPath,
		});
	};
	private static readonly planningStage: ReplayDependencies["stageSession"]["assertPlanningStageCompleted"] =
		async ({ targetDir, baselineSha }, { stage }) => ({
			artifact: {
				content: await Bun.file(
					join(targetDir, "backlog", "docs", "DOC-1 - spec.md"),
				).text(),
				path: "backlog/docs/DOC-1 - spec.md",
			},
			changedPaths: [],
			diff: "",
			resultSha: baselineSha,
			taskState: `${stage.name}-state`,
		});
	private static readonly taskOutput: ReplayDependencies["stageSession"]["readTaskOutput"] =
		async () =>
			await Promise.resolve(
				JSON.stringify({
					task: {
						acceptanceCriteria: ["done"],
						documentation: ["DOC-1 - spec.md"],
					},
				}),
			);
	private planningProtocol(
		defaults: ReplayDependencies["stageSession"],
	): ReplayDependencies["stageSession"] {
		return {
			...defaults,
			assertBuildCommitted: async () =>
				await Promise.reject(new Error("not a delivery stage")),
			assertPlanningStageCompleted: ReplayConcurrentProvider.planningStage,
			captureBuildCandidate: async () =>
				await Promise.reject(new Error("not a delivery stage")),
			captureCheckIntegrity: async () =>
				await Promise.resolve(harnessResult("PASS", "checks match")),
			captureStageCorpus,
			captureTreatmentChecks: async () =>
				await Promise.resolve(harnessResult("PASS", "all green")),
			changedPathsBetween: async () => await Promise.resolve([]),
			readTaskCard: async () => await Promise.resolve("confirmed task card"),
			readTaskOutput: ReplayConcurrentProvider.taskOutput,
			runWorkflowStage: this.runWorkflowStage,
		};
	}
	public readonly override: ReplayDependencyOverride = (defaults) => ({
		...defaults,
		...REAL_REPLAY_WORKTREES,
		loadStageRubric: async () => await Promise.resolve(FROZEN_REPLAY_RUBRIC),
		log: (message) => {
			this.log.push(message);
		},
		runSetup: async () => {
			await Promise.reject(new Error("not a delivery stage"));
		},
		runStageJudge: this.runStageJudge,
		stageSession: this.planningProtocol(defaults.stageSession),
	});
}
export { ReplayConcurrentProvider as default };
