import { recordsDirectory } from "#benchmark/config";
import { runRequestedExecution } from "#benchmark/confirmation";
import { assertSystemPromptSnapshotSupported } from "#benchmark/model-preflight";
import { diagnosticWriter } from "#cli/output";
import preparedSessionAttempts from "#cli/prepared-session-command";
import runSessionDebugAttempt from "#cli/session-debug-attempt";

import type {
	RunOutcome,
	SessionRunExecution,
	SessionRunExecutionDependencies,
} from "./run-command-contracts";
import SessionCommandAttempts from "./session-command-attempts";
import SessionCommandLifetime from "./session-command-lifetime";

async function executeSessionRun(
	{ config, output, sessionCase }: SessionRunExecution,
	dependencies: SessionRunExecutionDependencies,
): Promise<RunOutcome> {
	const execution = { config, output, sessionCase };
	if (execution.sessionCase.declaration.transcript !== undefined) {
		await (
			dependencies.assertSystemPromptSnapshotSupported ??
			assertSystemPromptSnapshotSupported
		)();
	}

	const runsDirectory = dependencies.runsDirectory ?? recordsDirectory();
	const runDebug = dependencies.runDebug ?? runSessionDebugAttempt;
	const executeAttempt =
		dependencies.executeAttempt ?? preparedSessionAttempts();

	const lifetime = new SessionCommandLifetime({
		boundary: dependencies,
		config,
		output,
		runsDirectory,
	});
	const attempts = new SessionCommandAttempts({
		dependencies,
		executeAttempt,
		execution,
		groupId: lifetime.groupId,
		runDebug,
		runsDirectory,
	});

	return await runRequestedExecution<RunOutcome>({
		approval: {
			output: diagnosticWriter(execution.output),
			prompt: lifetime.prompt,
		},
		confirmation: execution.config.confirmation,
		projectCost: attempts.projectCost,
		runConfirmed: attempts.runConfirmed,
		runDebug: attempts.runDebug,
		spendCeilingUsd: dependencies.spendCeilingUsd,
	}).finally(() => {
		lifetime.close();
	});
}
export { executeSessionRun as default };
