import { relative } from "node:path";

import type { ConfirmationRepRecord } from "./confirmation-record";
import type { JudgeOutputValidationError } from "./judge-attempt";
import judgeFailureContract from "./judge-failure-contract";
import type { PipelineRepFailure } from "./pipeline-rep-failure";

const RECORD_JSON_INDENT_SPACES = 2;
async function failedFinalOutcome(
	{ repPaths, plan, resultSha, failure }: PipelineRepFailure,
	judgeFailure: Readonly<JudgeOutputValidationError> | undefined,
	completedJudgeRejection: boolean,
): Promise<ConfirmationRepRecord["finalOutcome"]> {
	if (judgeFailure !== undefined) {
		await Bun.write(
			repPaths.finalFile,
			`${JSON.stringify(
				{
					attempts: judgeFailure.attempts,
					costUsd: judgeFailure.costUsd,
					error: failure.message,
					judgeContractSha256: judgeFailure.judgeContractSha256,
					prompt: judgeFailure.prompt,
					status: "REJECTED",
				},
				null,
				RECORD_JSON_INDENT_SPACES,
			)}\n`,
		);
	}

	return {
		error: failure.message,
		judgeContractSha256: judgeFailureContract(failure),
		status: "EXECUTION_FAILED",
		...(completedJudgeRejection
			? {
					evidence: {
						recordFile: relative(repPaths.directory, repPaths.finalFile),
						resultSha,
					},
				}
			: { worktreePath: plan.worktreePath }),
	};
}
export { failedFinalOutcome as default };
