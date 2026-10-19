import type { BenchmarkCase } from "#benchmark/case";
import type { BenchmarkConfig } from "#benchmark/config";
import { judgeSelfPreferenceWarning, parseArgs } from "#benchmark/config";
import { asUsageError } from "#cli/command-usage";
import {
	refuseStageCorpus,
	requireSpendAuthorization,
} from "#cli/interactive-stdin";
import { writeDiagnostic } from "#cli/output";

import type {
	RunCommandDependencies,
	RunCommandRequest,
} from "./run-command-contracts";
import { refuseWithoutTerminal } from "./run-interactivity";

interface PipelineRunConfigurationRequest {
	readonly benchmarkCase: BenchmarkCase;
	readonly request: RunCommandRequest;
}
function resolvePipelineRunConfig(
	{ benchmarkCase, request }: PipelineRunConfigurationRequest,
	dependencies: Pick<RunCommandDependencies, "environment" | "output">,
): BenchmarkConfig {
	const environment = dependencies.environment ?? Bun.env;
	const config = asUsageError(() =>
		parseArgs(request.args, environment, {
			caseId: benchmarkCase.declaration.id,
			model: benchmarkCase.declaration.model,
			pipelinePath: benchmarkCase.pipelinePath,
			sessionBudgetUsd: benchmarkCase.declaration.sessionBudgetUsd,
			targetPath: benchmarkCase.targetPath,
		}),
	);
	refuseStageCorpus(config.corpus);
	requireSpendAuthorization(request.args, environment, request.stdinIsTerminal);
	refuseWithoutTerminal(config, request.stdinIsTerminal);

	writeDiagnostic(dependencies.output, judgeSelfPreferenceWarning(config));

	return config;
}
export { resolvePipelineRunConfig as default };
