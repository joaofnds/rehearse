import type { SessionCase } from "#benchmark/case";
import { parseSessionArgs, recordsDirectory } from "#benchmark/config";
import { createSpendCeiling } from "#benchmark/spend-ceiling";
import { asUsageError } from "#cli/command-usage";
import { requireSpendAuthorization } from "#cli/interactive-stdin";
import { writeRecord } from "#cli/output";

import type {
	RunCommandDependencies,
	RunCommandRequest,
} from "./run-command-contracts";
import { requireConfirmationTerminal } from "./run-interactivity";

/**
 * A session case takes neither a target nor a pipeline, so it parses its own
 * configuration and skips the review pause the stage graph needs a TTY for:
 * a session attempt has no stage to pause between.
 */
interface SessionCaseCommandRequest {
	readonly sessionCase: SessionCase;
	readonly request: RunCommandRequest;
}
async function runSessionCase(
	{ sessionCase, request }: SessionCaseCommandRequest,
	dependencies: RunCommandDependencies,
): Promise<void> {
	const environment = dependencies.environment ?? Bun.env;
	const parsed = asUsageError(() =>
		parseSessionArgs(request.args, environment, {
			caseId: sessionCase.declaration.id,
			effort: sessionCase.declaration.effort,
			model: sessionCase.declaration.model,
			sessionBudgetUsd: sessionCase.declaration.sessionBudgetUsd,
		}),
	);

	requireSpendAuthorization(request.args, environment, request.stdinIsTerminal);
	requireConfirmationTerminal(parsed.confirmation, request.stdinIsTerminal);
	const spendCeiling = createSpendCeiling({
		ceilingUsd: await dependencies.requireSpendCeiling(recordsDirectory()),
	});
	const config = {
		...parsed,
		sessionBudgetUsd: spendCeiling.budgetFor(parsed.sessionBudgetUsd),
	};

	const outcome = await dependencies.executeSession(
		{ config, output: dependencies.output, sessionCase },
		{
			probeModel: dependencies.probeModel,
			spendCeilingUsd: spendCeiling.ceilingUsd,
		},
	);

	await writeRecord(dependencies.output, outcome.recordFile, request.json);
}

export { runSessionCase as default };
