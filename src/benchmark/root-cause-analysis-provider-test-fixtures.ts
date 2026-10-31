import type { ClaudeEnvelope } from "./contracts";
import type { AnalysisInvoker, AnalysisResult } from "./root-cause-analysis";
import { analyzeRun } from "./root-cause-analysis";
import { RUN, noSignalHandling } from "./root-cause-analysis-test-support";
import { nothingRunning } from "./run-records-test-support";

const PROVIDER_BUDGET_USD = 30;

const ANSWER = {
	narrative: "the build skill never asks for a direct run",
	pairedRerun: "replay build with the run step restored",
	rootCause: {
		file: "skills/build/SKILL.md",
		lines: { end: 3, start: 2 },
		stage: "build",
	},
	stages: [
		{
			contribution: "left the grade where it was",
			note: "the card was complete",
			role: "not a factor",
			stage: "shape",
		},
		{
			contribution: "cost the observed-result requirement",
			note: "no direct run was recorded",
			role: "root cause",
			stage: "build",
		},
	],
} as const;

function answering(
	structuredOutput: ClaudeEnvelope["structured_output"],
): ClaudeEnvelope {
	return {
		session_id: "analysis-session",
		structured_output: structuredOutput,
		total_cost_usd: 0.24,
	};
}

async function recordAnalysis(
	directory: string,
	startedAt: string,
	answer: ClaudeEnvelope["structured_output"] = ANSWER,
): Promise<AnalysisResult> {
	return await analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		{
			invoke: async () =>
				await Promise.resolve(JSON.stringify(answering(answer))),
			liveness: nothingRunning,
			now: () => new Date(startedAt),
			requireSpendCeiling: async () =>
				await Promise.resolve(PROVIDER_BUDGET_USD),
			stopOnSignal: noSignalHandling,
		},
	);
}
class FakeAnalysisProvider {
	public readonly budgets: number[] = [];
	public readonly prompts: string[] = [];
	private reply: ClaudeEnvelope | Error = answering(ANSWER);

	public answer(envelope: ClaudeEnvelope): void {
		this.reply = envelope;
	}

	public fail(error: Readonly<Error>): void {
		this.reply = error;
	}

	public failWithoutMessage(): void {
		const silent = new Error("cleared below");
		silent.message = "";
		this.fail(silent);
	}

	public readonly invoke: AnalysisInvoker = async (prompt, budgetUsd) => {
		this.prompts.push(prompt);
		this.budgets.push(budgetUsd);
		if (this.reply instanceof Error) {
			return await Promise.reject(this.reply);
		}

		return await Promise.resolve(JSON.stringify(this.reply));
	};
}
export { ANSWER, answering, recordAnalysis, FakeAnalysisProvider };
