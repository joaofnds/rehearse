import type { StageJudgeInput, StageScorecard } from "./contracts";
import { StageValidationError } from "./contracts";
import type { JudgeBudget } from "./judge-attempt";
import { runJudgeAttempts } from "./judge-attempt";
import withJudgeDirectory from "./judge-directory";
import type { JudgeSettings } from "./judge-invocation";
import { stageJudgeInvoker } from "./judge-invocation";
import type { StageJudgment } from "./judge-prompts";
import { stageJudgePrompt } from "./judge-prompts";
import type { JudgeProgress } from "./run-events";
import { readStageGrade } from "./stage-grade";
import { checkedStageEvidence } from "./stage-judge-evidence";
import type { StageJudgeInvoker } from "./stage-judge-progress";
import watchJudgeProgress from "./stage-judge-progress";

async function captureStageJudgeInput(
	fallback: StageJudgeInput,
	capture: () => Promise<StageJudgeInput>,
): Promise<StageJudgeInput> {
	try {
		return await capture();
	} catch (error) {
		if (!(error instanceof StageValidationError)) {
			throw error;
		}

		return {
			...fallback,
			harnessFailure: error instanceof Error ? error.message : String(error),
		};
	}
}

interface StageJudgeExecution extends JudgeSettings {
	readonly budget: JudgeBudget;
}

interface StageJudgeHooks {
	readonly invoke?: StageJudgeInvoker | undefined;
	readonly onProgress?: ((progress: JudgeProgress) => void) | undefined;
}

async function runStageJudge(
	{ model, effort, budget }: StageJudgeExecution,
	{ evidenceOrigin, input, source }: StageJudgment,
	{ invoke, onProgress }: StageJudgeHooks = {},
): Promise<StageScorecard> {
	return await withJudgeDirectory(
		`rehearse-${input.stage}-judge-`,
		async (judgeDirectory) => {
			const prompt = stageJudgePrompt({ evidenceOrigin, input, source });
			const invokeJudge =
				invoke ?? stageJudgeInvoker(judgeDirectory, { effort, model });

			const watch = watchJudgeProgress(invokeJudge, {
				checkItem: (partial) => {
					checkedStageEvidence(partial, input);
				},
				report: onProgress ?? ((): void => undefined),
				rubric: source.rubric,
			});

			const result = await runJudgeAttempts(
				prompt,
				{
					invoke: watch.invoke,
					validate: (envelope) =>
						readStageGrade(envelope, {
							input,
							rejected: watch.rejected,
							source,
						}),
				},
				budget,
			);

			return {
				attempts: result.attempts,
				costUsd: result.costUsd,
				grade: result.value,
				input,
				prompt,
				rubric: source.rubric,
				rubricPath: source.rubricPath,
				stage: input.stage,
			};
		},
	);
}

export { captureStageJudgeInput, runStageJudge };
export type { StageJudgeHooks };
