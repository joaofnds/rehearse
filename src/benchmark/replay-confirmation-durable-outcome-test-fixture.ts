import { captureStageCorpus } from "./checkpoint";
import type { ClaudeCallMetrics } from "./contracts";
import type { JudgeAttempt } from "./judge-attempt";
import { JudgeOutputValidationError } from "./judge-attempt";
import type { ReplayDependencies } from "./replay";
import { replayScorecard } from "./replay-confirmation-stage-test-harness";
import ReplayConfirmationHarness from "./replay-confirmation-test-support";
import type { ReplayDependencyOverride } from "./replay-confirmation-test-support";
import { REAL_REPLAY_WORKTREES } from "./replay-confirmation-worktree-test-fixtures";
import { removeWorktree } from "./target";

class ReplayDurableOutcomes extends ReplayConfirmationHarness {
	public readonly metric: ClaudeCallMetrics = {
		cacheReadTokens: 30,
		cacheWriteTokens: 40,
		costUsd: 0.25,
		inputTokens: 100,
		outputTokens: 20,
		turns: 2,
	};
	public readonly runStageJudge: ReplayDependencies["runStageJudge"] = async (
		_execution,
		{ input },
	) => {
		const attempt: JudgeAttempt = {
			costUsd: this.metric.costUsd,
			metrics: this.metric,
			outcome: "ACCEPTED",
			payload: { summary: "completed" },
		};
		if (input.transcript.sessionId.endsWith("-rep-2")) {
			throw new JudgeOutputValidationError({
				attempts: [
					{ ...attempt, error: "invalid output", outcome: "REJECTED" },
				],
				costUsd: this.metric.costUsd,
				message: "Judge rejected both attempts",
				prompt: "prompt",
			});
		}

		return await Promise.resolve({
			...replayScorecard(input, "STOP"),
			attempts: [attempt],
		});
	};
	private static readonly planningStage: ReplayDependencies["stageSession"]["assertPlanningStageCompleted"] =
		async ({ baselineSha }, { stage }) =>
			await Promise.resolve({
				artifact: {
					content: "confirmed spec\n",
					path: "backlog/docs/DOC-1 - spec.md",
				},
				changedPaths: [],
				diff: "",
				resultSha: baselineSha,
				taskState: `${stage.name}-state`,
			});
	public readonly runWorker: ReplayDependencies["stageSession"]["runWorkflowStage"] =
		async (workflowRequest) =>
			await Promise.resolve({
				costUsd: this.metric.costUsd,
				exchanges: [],
				providerCalls: [{ metrics: this.metric }],
				sessionId: workflowRequest.targetDir,
				stage: workflowRequest.stage,
			});
	public readonly override: ReplayDependencyOverride = (defaults) => ({
		...defaults,
		...REAL_REPLAY_WORKTREES,
		loadStageRubric: async () =>
			await Promise.resolve({
				content: "{}\n",
				rubric: {
					dimensions: [],
					hardBlockers: [],
					requirements: [],
				},
				rubricPath: "rubrics/discuss.json",
			}),
		removeWorktree: async (targetDir, worktreeDir) => {
			this.removed.push(worktreeDir);
			await removeWorktree(targetDir, worktreeDir);
		},
		runStageJudge: this.runStageJudge,
		stageSession: {
			...defaults.stageSession,
			assertPlanningStageCompleted: ReplayDurableOutcomes.planningStage,
			captureStageCorpus,
			runWorkflowStage: this.runWorker,
		},
	});
}
export default ReplayDurableOutcomes;
