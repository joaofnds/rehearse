import { JudgeExecutionError } from "./judge-attempt";
import JudgeAttemptBuilder from "./judge-attempt-test-builder";
import JudgeCeilingStopError from "./judge-ceiling-stop-error";
import type { PipelineConfirmationDependencies } from "./pipeline-confirmation";
import { CONFIRMATION_METRIC } from "./pipeline-confirmation-judging-test-fixtures";

const FIRST_REP_ORDINAL = 1;

interface JudgeFailureProps {
	readonly kind: "ceiling" | "invocation";
}

function ceilingFailure(): JudgeCeilingStopError {
	return new JudgeCeilingStopError({
		attempts: [new JudgeAttemptBuilder().build()],
		ceilingUsd: 45,
		costUsd: CONFIRMATION_METRIC.costUsd,
		prompt: "prompt",
		spentUsd: 45,
	});
}
function invocationFailure(): JudgeExecutionError {
	return new JudgeExecutionError({
		attempts: [new JudgeAttemptBuilder().build()],
		cause: new Error("stage Judge invocation failed"),
		costUsd: CONFIRMATION_METRIC.costUsd,
		failedCallMetrics: undefined,
		prompt: "prompt",
	});
}

class PipelineStageJudgeFailureFake {
	private readonly failure: Error;

	private constructor(props: JudgeFailureProps) {
		this.failure =
			props.kind === "ceiling" ? ceilingFailure() : invocationFailure();
	}
	public static ceiling(): PipelineStageJudgeFailureFake {
		return new PipelineStageJudgeFailureFake({ kind: "ceiling" });
	}
	public static invocation(): PipelineStageJudgeFailureFake {
		return new PipelineStageJudgeFailureFake({ kind: "invocation" });
	}
	public readonly override = (
		dependencies: PipelineConfirmationDependencies,
	): PipelineConfirmationDependencies => {
		const { stageSession, runStageJudge } = dependencies;
		const { runWorkflowStage } = stageSession;

		return {
			...dependencies,
			runStageJudge: async ({ model, effort, budget }, { input, source }) => {
				const ordinal = /-rep-(?<ordinal>\d+)$/u.exec(
					input.transcript.sessionId,
				);
				if (
					input.stage === "build" &&
					Number(ordinal?.groups?.["ordinal"]) === FIRST_REP_ORDINAL
				) {
					throw this.failure;
				}

				return await runStageJudge(
					{ budget, effort, model },
					{ input, source },
				);
			},
			stageSession: {
				...stageSession,
				runWorkflowStage: async (request) => ({
					...(await runWorkflowStage(request)),
					sessionId: request.targetDir,
				}),
			},
		};
	};
}

export { PipelineStageJudgeFailureFake as default };
