import type { SessionAttempt, SessionAttemptRequest } from "./session-attempt";
import runSessionJudge from "./session-judge";
import { sessionJudgeInput } from "./session-judge-evidence";
import { createSpendCeiling } from "./spend-ceiling";

const NO_REPORTED_COST = 0;

interface AttemptJudgeEvidence {
	readonly stateDirectory: string;
	readonly workerCostUsd: number | undefined;
}

async function judgeCompletedAttempt(
	request: SessionAttemptRequest,
	completed: SessionAttempt,
	{ stateDirectory, workerCostUsd }: AttemptJudgeEvidence,
): Promise<SessionAttempt> {
	const definition = request.sessionCase.judge;
	if (definition === undefined) {
		return completed;
	}
	request.inFlight.assertOpen();
	const spendCeiling =
		request.spendCeiling ??
		createSpendCeiling({ ceilingUsd: request.settings.budgetUsd });
	spendCeiling.charge(
		workerCostUsd ?? completed.metrics?.costUsd ?? NO_REPORTED_COST,
		completed.metrics,
	);
	const judge = await runSessionJudge({
		definition,
		input: await sessionJudgeInput({
			boundary:
				completed.transcriptDiagnostics.state === "unavailable"
					? undefined
					: completed.transcriptDiagnostics.prefixLinesExcluded,
			files: definition.files,
			prompt: request.sessionCase.prompt,
			reply: completed.reply,
			stateDirectory,
			transcriptFile: completed.transcriptFile,
		}),
		invoke: request.invokeJudge,
		settings: request.settings,
		spendCeiling,
	});

	return { ...completed, judge };
}

export { judgeCompletedAttempt as default };
