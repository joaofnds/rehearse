import type { BenchmarkConfirmationExecution } from "#benchmark/benchmark-command";
import executeBenchmark from "#benchmark/benchmark-command";
import type { PipelineConfirmationOutcome } from "#benchmark/pipeline-confirmation";
import { runBenchmark } from "#benchmark/run";
import type { BenchmarkRunPaths } from "#benchmark/run-layout";
import { diagnosticWriter, signalDiagnostics } from "#cli/output";
import type { TerminalQuestioner } from "#cli/questioner";
import terminalQuestioner from "#cli/questioner";

import reportConfirmationOutcome from "./confirmation-command-output";
import confirmRun from "./pipeline-confirmation-command";
import type { PipelineRunExecution, RunOutcome } from "./run-command-contracts";

class PipelineRunAttempts {
	public constructor(
		private readonly execution: PipelineRunExecution,
		private readonly questioner: TerminalQuestioner,
	) {}
	public readonly runConfirmed = async (
		confirmation: BenchmarkConfirmationExecution,
	): Promise<PipelineConfirmationOutcome> => {
		const { benchmarkCase, config, loadedSettings, output, spendCeilingUsd } =
			this.execution;

		return await confirmRun(
			{ benchmarkCase, config, loadedSettings },
			{ confirmation, output, spendCeilingUsd },
		);
	};
	public readonly runDebug = async (): Promise<BenchmarkRunPaths> => {
		const { benchmarkCase, config, loadedSettings, output, spendCeilingUsd } =
			this.execution;

		return await runBenchmark(
			{ benchmarkCase, config, loadedSettings },
			{
				progress: signalDiagnostics(output),
				rl: this.questioner,
				spendCeilingUsd,
			},
		);
	};
}
async function executeRun(
	{
		config,
		output,
		benchmarkCase,
		loadedSettings,
		spendCeilingUsd,
	}: PipelineRunExecution,
	questioner: TerminalQuestioner = terminalQuestioner(
		signalDiagnostics(output).flush,
	),
): Promise<RunOutcome> {
	const attempts = new PipelineRunAttempts(
		{ benchmarkCase, config, loadedSettings, output, spendCeilingUsd },
		questioner,
	);

	try {
		const outcome = await executeBenchmark(
			config,
			{
				spendCeilingUsd,
				stageCount: benchmarkCase.pipeline.stages.length,
			},
			{
				approval: {
					output: diagnosticWriter(output),
					prompt: async (message) => await questioner.question(message),
				},
				runConfirmed: attempts.runConfirmed,
				runDebug: attempts.runDebug,
			},
		);
		if (outcome.kind === "confirmation") {
			return reportConfirmationOutcome(output, outcome.evidence);
		}

		return { kind: "debug", recordFile: outcome.evidence.artifactFile };
	} finally {
		questioner.close();
	}
}
export { executeRun as default };
