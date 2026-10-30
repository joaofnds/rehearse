import { JudgeOutputValidationError } from "./judge-attempt";
import JudgeAttemptBuilder from "./judge-attempt-test-builder";
import { CONFIRMATION_METRIC } from "./pipeline-confirmation-judging-test-fixtures";
import type { PipelineDependencyOverride } from "./pipeline-confirmation-test-support";
import { WorkflowExecutionError } from "./workflow";

function workerInvocationFailure(): WorkflowExecutionError {
	return new WorkflowExecutionError({
		cause: new Error("worker invocation failed"),
		costUsd: undefined,
		providerCalls: [{ metrics: CONFIRMATION_METRIC }, {}],
		sessionId: "worker-session",
	});
}

function rejectedStageJudgment(): JudgeOutputValidationError {
	return new JudgeOutputValidationError({
		attempts: [new JudgeAttemptBuilder().build()],
		costUsd: CONFIRMATION_METRIC.costUsd,
		message: "Stage Judge rejected both attempts",
		prompt: "stage prompt",
	});
}

const INITIAL_REP_ORDINAL = 1;
function repOrdinal(targetDirectory: string): number {
	const match = /-rep-(?<ordinal>\d+)$/u.exec(targetDirectory);
	return Number(match?.groups?.["ordinal"]);
}
const failFirstWorkerInvocation: PipelineDependencyOverride = (
	dependencies,
) => {
	const { stageSession } = dependencies;
	const { runWorkflowStage } = stageSession;

	return {
		...dependencies,
		stageSession: {
			...stageSession,
			runWorkflowStage: async (request) => {
				if (
					request.stage === "discuss" &&
					repOrdinal(request.targetDir) === INITIAL_REP_ORDINAL
				) {
					throw workerInvocationFailure();
				}

				return await runWorkflowStage(request);
			},
		},
	};
};

export { failFirstWorkerInvocation, rejectedStageJudgment };
