import { materializeCheckpoint } from "./checkpoint";
import type { StageScorecard } from "./contracts";
import { JudgeOutputValidationError } from "./judge-attempt";
import type { ReplayDependencies } from "./replay";
import ReplayDurableOutcomes from "./replay-confirmation-durable-outcome-test-fixture";
import { replayScorecard } from "./replay-confirmation-stage-test-harness";
import type { ReplayDependencyOverride } from "./replay-confirmation-test-support";
import { addWorktree } from "./target";

const THIRD_REP_ORDINAL = 3;
class ReplaySetupFailures extends ReplayDurableOutcomes {
	public readonly finished: number[] = [];
	public readonly worktreeCreated: string[] = [];
	public override readonly runStageJudge: ReplayDependencies["runStageJudge"] =
		async (_execution, { input }) => {
			if (input.transcript.sessionId.endsWith("-rep-4")) {
				throw new JudgeOutputValidationError({
					attempts: [
						{
							costUsd: this.metric.costUsd,
							error: "invalid output",
							metrics: this.metric,
							outcome: "REJECTED",
							payload: { invalid: true },
						},
					],
					costUsd: this.metric.costUsd,
					message: "Judge rejected both attempts",
					prompt: "prompt",
				});
			}

			return await Promise.resolve<StageScorecard>({
				...replayScorecard(input, "STOP"),
				attempts: [
					{
						costUsd: this.metric.costUsd,
						metrics: this.metric,
						outcome: "ACCEPTED",
						payload: { summary: "stop" },
					},
				],
			});
		};
	public override readonly runWorker: ReplayDependencies["stageSession"]["runWorkflowStage"] =
		async (workflowRequest) => {
			const match = /-rep-(?<ordinal>\d+)$/u.exec(workflowRequest.targetDir);
			const ordinal = Number(match?.groups?.["ordinal"]);
			this.finished.push(ordinal);
			if (ordinal === THIRD_REP_ORDINAL) {
				return await Promise.reject(new Error("worker failed before evidence"));
			}

			return await Promise.resolve({
				costUsd: this.metric.costUsd,
				exchanges: [],
				providerCalls: [{ metrics: this.metric }],
				sessionId: workflowRequest.targetDir,
				stage: workflowRequest.stage,
			});
		};
	public readonly failureOverride: ReplayDependencyOverride = (defaults) => ({
		...defaults,
		addWorktree: async (targetDir, sha, worktreeDir) => {
			if (worktreeDir.endsWith("-rep-1")) {
				throw new Error("synthetic worktree collision");
			}

			await addWorktree(targetDir, sha, worktreeDir);
			this.worktreeCreated.push(worktreeDir);
		},
		materializeCheckpoint: async (checkpointDir, worktreeDir) => {
			if (worktreeDir.endsWith("-rep-2")) {
				throw new Error("synthetic checkpoint rejection");
			}

			return await materializeCheckpoint(checkpointDir, worktreeDir);
		},
	});
}
export default ReplaySetupFailures;
