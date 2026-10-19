import type { StageScorecard } from "./contracts";
import { JudgeOutputValidationError } from "./judge-attempt";
import JudgeAttemptBuilder from "./judge-attempt-test-builder";
import type { PipelineConfirmationDependencies } from "./pipeline-confirmation";
import {
	CONFIRMATION_METRIC,
	pipelineStageScorecard,
} from "./pipeline-confirmation-judging-test-fixtures";
import { repOrdinal } from "./pipeline-confirmation-workspace-test-fixture";

const SECOND_REP_ORDINAL = 2;

function rejectedPeerJudge(): JudgeOutputValidationError {
	return new JudgeOutputValidationError({
		attempts: [new JudgeAttemptBuilder().build()],
		costUsd: CONFIRMATION_METRIC.costUsd,
		message: "Judge rejected both attempts",
		prompt: "prompt",
	});
}

const judge: PipelineConfirmationDependencies["runStageJudge"] = async (
	_execution,
	{ input, source },
) => {
	if (input.stage === "build" && input.transcript.sessionId.startsWith("3-")) {
		return await Promise.reject(rejectedPeerJudge());
	}

	const scorecard = pipelineStageScorecard(input, source);
	const continues = input.transcript.sessionId.startsWith("3-");

	return await Promise.resolve<StageScorecard>({
		...scorecard,
		grade: {
			...scorecard.grade,
			grade: continues ? "A" : "F",
			summary: continues ? "continue" : "stop",
			verdict: continues ? "CONTINUE" : "STOP",
		},
	});
};

class PipelinePeerFailureFake {
	public readonly finished: number[] = [];
	private readonly failed = Promise.withResolvers<boolean>();

	public readonly override = (
		dependencies: PipelineConfirmationDependencies,
	): PipelineConfirmationDependencies => {
		const { stageSession } = dependencies;
		const { runWorkflowStage } = stageSession;

		return {
			...dependencies,
			runFinalJudge: async () =>
				await Promise.reject(new Error("final Judge is not reached")),
			runStageJudge: judge,
			stageSession: {
				...stageSession,
				runWorkflowStage: async (request) => {
					const rep = repOrdinal(request.targetDir);
					if (rep === SECOND_REP_ORDINAL) {
						this.failed.resolve(true);

						throw new Error("worker failed before evidence");
					}

					await this.failed.promise;
					if (request.stage === "discuss") {
						this.finished.push(rep);
					}

					const result = await runWorkflowStage(request);
					return { ...result, sessionId: `${rep}-${request.stage}` };
				},
			},
		};
	};
}

export { PipelinePeerFailureFake as default };
