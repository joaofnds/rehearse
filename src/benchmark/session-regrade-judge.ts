import type { SessionJudgeRecord } from "./contracts";
import runSessionJudge from "./session-judge";
import { sessionJudgeInput } from "./session-judge-evidence";
import type { RegradeRequest } from "./session-regrade-evidence";
import { recordedBoundary } from "./session-regrade-evidence";
import { createSpendCeiling } from "./spend-ceiling";

async function regradeSessionJudge(
	request: RegradeRequest,
): Promise<SessionJudgeRecord | undefined> {
	const definition = request.sessionCase.judge;
	if (definition === undefined) {
		return undefined;
	}

	return await runSessionJudge({
		definition: {
			...definition,
			model: request.judge?.model ?? definition.model,
		},
		input: await sessionJudgeInput({
			boundary: recordedBoundary(request.record),
			files: definition.files,
			prompt: request.record.prompt,
			reply: request.record.reply,
			stateDirectory: `${request.paths.directory}/state`,
			transcriptFile: request.paths.transcriptFile,
		}),
		invoke: request.judge?.invoke,
		settings: {
			budgetUsd: request.record.sessionBudgetUsd,
			effort: request.record.effort,
			model: request.record.model,
		},
		spendCeiling:
			request.judge?.spendCeiling ??
			createSpendCeiling({ ceilingUsd: request.record.sessionBudgetUsd }),
	});
}

export { regradeSessionJudge as default };
