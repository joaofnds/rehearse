import { EXIT_CODES } from "#benchmark/exit-codes";
import {
	DEFAULT_ANALYSIS_BUDGET_USD,
	sealedAnalysisInvoker,
} from "#benchmark/root-cause-analysis";
import { liveRunLiveness } from "#benchmark/run-liveness";
import { requireSpendCeiling } from "#benchmark/settings";
import type { CommandEntry, CommandInvocation } from "#cli/command-contract";
import { flagValue, jsonFlag } from "#cli/command-flags";
import runDiagnose from "#cli/diagnose-command";
import { processOutput } from "#cli/output";

async function executeDiagnose({
	commandLine,
	runsDirectory,
}: CommandInvocation): Promise<number> {
	await runDiagnose(
		{
			budgetUsd: flagValue(commandLine.flags, "--budget-usd"),
			id: commandLine.argument,
			json: commandLine.json,
			model: flagValue(commandLine.flags, "--model"),
			runsDirectory,
		},
		{
			invokerFor: sealedAnalysisInvoker,
			liveness: liveRunLiveness(),
			now: () => new Date(),
			output: processOutput,
			requireSpendCeiling,
		},
	);

	return EXIT_CODES.completed;
}
const diagnosisCommands: readonly CommandEntry[] = [
	{
		definition: {
			argument: "run",
			confinement: "never",
			flags: [
				{
					help: "Model the analysis session uses; required",
					kind: "value",
					name: "--model",
				},
				{
					defaultValue: String(DEFAULT_ANALYSIS_BUDGET_USD),
					help: "Most the analysis call may spend, held under the stored spend ceiling",
					kind: "value",
					name: "--budget-usd",
				},
				jsonFlag,
			],
			name: "diagnose",
			summary:
				"Ask one sealed session which corpus file an ended run's outcome traces to, and record its answer",
		},
		execute: executeDiagnose,
	},
];
export { diagnosisCommands as default };
