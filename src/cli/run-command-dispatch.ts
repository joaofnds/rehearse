import { EXIT_CODES } from "#benchmark/exit-codes";
import { defaultProbeModel } from "#benchmark/model-preflight";
import { assertPipelinePreflight } from "#benchmark/preflight";
import { requireSpendCeiling } from "#benchmark/settings";
import { requireCase } from "#cli/case-command";
import type { CommandInvocation } from "#cli/command-contract";
import { processOutput } from "#cli/output";
import executeRun from "#cli/pipeline-run-execution";
import { runRunCommand } from "#cli/run-command";
import executeSessionRun from "#cli/session-run-execution";

async function dispatchRun({
	commandLine,
}: CommandInvocation): Promise<number> {
	await runRunCommand(
		{
			args: commandLine.flags,
			json: commandLine.json,
			stdinIsTerminal: process.stdin.isTTY,
		},
		{
			assertPreflight: assertPipelinePreflight,
			execute: executeRun,
			executeSession: executeSessionRun,
			output: processOutput,
			probeModel: defaultProbeModel,
			requireCase,
			requireSpendCeiling,
		},
	);

	return EXIT_CODES.completed;
}

export { dispatchRun as default };
