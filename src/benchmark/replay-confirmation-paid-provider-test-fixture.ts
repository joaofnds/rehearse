import type {
	ClaudeCallMetrics,
	ProviderCall,
	StageScorecard,
} from "./contracts";
import { JudgeExecutionError } from "./judge-attempt";
import JudgeCeilingStopError from "./judge-ceiling-stop-error";
import type { RunManifest } from "./manifest";
import { replayScorecard } from "./replay-confirmation-stage-test-harness";
import type { ReplayDependencyOverride } from "./replay-confirmation-test-support";
import StageSessionError from "./stage-session-error";

class ReplayPaidProvider {
	public readonly metric: ClaudeCallMetrics = {
		cacheReadTokens: 30,
		cacheWriteTokens: 40,
		costUsd: 0.25,
		inputTokens: 100,
		outputTokens: 20,
		turns: 2,
	};
	readonly #manifest: Readonly<RunManifest>;
	#ownerCalls: readonly ProviderCall[] = [{ metrics: this.metric }];
	public constructor(manifest: Readonly<RunManifest>) {
		this.#manifest = manifest;
	}
	public withMissingOwnerMetrics(): this {
		this.#ownerCalls = [{ metrics: this.metric }, {}];
		return this;
	}
	public readonly override: ReplayDependencyOverride = (defaults) => ({
		...defaults,
		currentSha: async () => await Promise.resolve(this.#manifest.taskSha),
		stageSession: {
			...defaults.stageSession,
			runWorkflowStage: async (request) => ({
				...(await defaults.stageSession.runWorkflowStage(request)),
				providerCalls: [{ metrics: this.metric }],
			}),
		},
	});
	public readonly ownerOverride: ReplayDependencyOverride = (defaults) => ({
		...defaults,
		createProductOwner: () => ({
			ask: async () => await Promise.resolve("Use the small scope"),
			snapshot: () => ({
				providerCalls: this.#ownerCalls.map((call) => ({ ...call })),
				sessionId: "po-session",
				spentUsd: this.metric.costUsd,
			}),
		}),
	});
	public readonly judgeOverride: ReplayDependencyOverride = (defaults) => ({
		...defaults,
		runStageJudge: async (_execution, { input }) =>
			await Promise.resolve<StageScorecard>({
				...replayScorecard(input),
				attempts: [
					{
						costUsd: this.metric.costUsd,
						metrics: this.metric,
						outcome: "ACCEPTED",
						payload: { summary: "accepted" },
					},
				],
			}),
	});
	public static readonly judgeExecutionFailure: ReplayDependencyOverride = (
		dependencies,
	) => ({
		...dependencies,
		runStageJudge: async () =>
			await Promise.reject(
				new JudgeExecutionError({
					attempts: [],
					cause: new Error("stage Judge invocation failed"),
					costUsd: 0,
					failedCallMetrics: undefined,
					prompt: "prompt",
				}),
			),
	});
	public readonly judgeCeilingFailure: ReplayDependencyOverride = (
		dependencies,
	) => ({
		...dependencies,
		runStageJudge: async () =>
			await Promise.reject(
				new JudgeCeilingStopError({
					attempts: [
						{
							costUsd: this.metric.costUsd,
							error: "invalid output",
							metrics: this.metric,
							outcome: "REJECTED",
							payload: { invalid: true },
						},
					],
					ceilingUsd: 45,
					costUsd: this.metric.costUsd,
					prompt: "prompt",
					spentUsd: 45,
				}),
			),
	});
	public readonly stageSessionFailure: ReplayDependencyOverride = (
		dependencies,
	) => ({
		...dependencies,
		stageSession: {
			...dependencies.stageSession,
			runWorkflowStage: async () =>
				await Promise.reject(
					new StageSessionError({
						cause: new Error("Product Owner call halted"),
						costUsd: this.metric.costUsd,
						providerCalls: [{ metrics: this.metric }],
					}),
				),
		},
	});
	public static readonly postSessionFailure: ReplayDependencyOverride = (
		dependencies,
	) => ({
		...dependencies,
		stageSession: {
			...dependencies.stageSession,
			readTaskOutput: async () =>
				await Promise.reject(new Error("backlog is gone")),
		},
	});
}
export default ReplayPaidProvider;
