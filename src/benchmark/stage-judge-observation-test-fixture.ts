import type { StageJudgeResponse, StageScorecard } from "./contracts";
import type { JudgeProgress } from "./run-events";
import { runStageJudge } from "./stage-grading";
import { stageJudgeInput } from "./stage-grading-test-fixtures";
import {
	envelope,
	progressRubric,
	streamed,
} from "./stage-judge-stream-test-fixtures";
import { judgeBudget } from "./test-support";

const FINAL_PROGRESS_READING_OFFSET = -1;

interface StageJudgeAttemptFixture {
	readonly frames: readonly Partial<StageJudgeResponse>[];
	readonly response: Partial<StageJudgeResponse>;
}

interface StageJudgeObservation {
	readonly scorecard: StageScorecard;
	readonly progress: readonly JudgeProgress[];
	readonly beforeGrade: JudgeProgress | undefined;
}

/** Records streamed readings before returning the provider's final envelope. */
async function observeStageJudge(
	attempts: readonly StageJudgeAttemptFixture[],
	report: (reading: JudgeProgress) => void = (): void => undefined,
): Promise<StageJudgeObservation> {
	const pending = [...attempts];
	const progress: JudgeProgress[] = [];
	const beforeGrades: (JudgeProgress | undefined)[] = [];
	const scorecard = await runStageJudge(
		{ budget: judgeBudget(), effort: undefined, model: "sonnet" },
		{ input: stageJudgeInput("build"), source: progressRubric },
		{
			invoke: async (_prompt, onLine) => {
				const attempt = pending.shift();
				if (attempt === undefined) {
					throw new Error("no scripted judge attempt left");
				}
				for (const frame of attempt.frames) {
					for (const line of streamed(frame)) {
						onLine(line);
					}
				}
				beforeGrades.push(progress.at(FINAL_PROGRESS_READING_OFFSET));
				return await Promise.resolve(envelope(attempt.response));
			},
			onProgress: (reading) => {
				progress.push(reading);
				report(reading);
			},
		},
	);
	return {
		beforeGrade: beforeGrades.at(FINAL_PROGRESS_READING_OFFSET),
		progress,
		scorecard,
	};
}

export { observeStageJudge as default };
