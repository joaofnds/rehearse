import { parseCaseId } from "#benchmark/config";
import { asUsageError } from "#cli/command-usage";

import runPipelineCase from "./pipeline-case-command";
import type {
	RunCommandDependencies,
	RunCommandRequest,
} from "./run-command-contracts";
import runSessionCase from "./session-case-command";

async function runRunCommand(
	request: RunCommandRequest,
	dependencies: RunCommandDependencies,
): Promise<void> {
	const environment = dependencies.environment ?? Bun.env;
	const caseId = asUsageError(() => parseCaseId(request.args, environment));
	const loaded = await dependencies.requireCase(caseId);

	if (loaded.kind === "session") {
		await runSessionCase({ request, sessionCase: loaded }, dependencies);

		return;
	}

	await runPipelineCase({ benchmarkCase: loaded, request }, dependencies);
}

export { default as executeRun } from "./pipeline-run-execution";

export { default as buildConfirmationRequest } from "./pipeline-confirmation-request";

export { default as executeSessionRun } from "./session-run-execution";

export type {
	RunCommandDependencies,
	RunCommandRequest,
	RunOutcome,
	SessionExecutionBoundary,
	SessionRunExecutionDependencies,
} from "./run-command-contracts";

export type { ConfirmationRequestInputs } from "./pipeline-confirmation-request";

export { runRunCommand };
