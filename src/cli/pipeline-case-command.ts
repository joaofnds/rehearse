import type { BenchmarkCase } from "#benchmark/case";
import { withPipeline } from "#benchmark/case";
import type { BenchmarkConfig } from "#benchmark/config";
import { recordsDirectory } from "#benchmark/config";
import { refusePipelineUnderLinkedDirectory } from "#benchmark/corpus-source";
import { asRefusedPrecondition } from "#benchmark/preflight";
import { writeRecord } from "#cli/output";

import resolvePipelineRunConfig from "./pipeline-run-config";
import type {
	RunCommandDependencies,
	RunCommandRequest,
} from "./run-command-contracts";

interface PipelineCaseCommandRequest {
	readonly benchmarkCase: BenchmarkCase;
	readonly request: RunCommandRequest;
}
async function runPipelineCase(
	{ benchmarkCase, request }: PipelineCaseCommandRequest,
	dependencies: RunCommandDependencies,
): Promise<void> {
	const config = resolvePipelineRunConfig(
		{ benchmarkCase, request },
		dependencies,
	);

	const selected = await asRefusedPrecondition(
		async () => await selectedCase(benchmarkCase, config),
	);
	const spendCeilingUsd =
		await dependencies.requireSpendCeiling(recordsDirectory());
	await refusePipelineUnderLinkedDirectory(recordsDirectory());
	const loadedSettings = await dependencies.assertPreflight({
		model: config.model,
		settingsFilePath: selected.settingsFilePath,
		sourceDir: config.sourceDir,
	});

	const outcome = await dependencies.execute({
		benchmarkCase: selected,
		config,
		loadedSettings,
		output: dependencies.output,
		spendCeilingUsd,
	});

	await writeRecord(dependencies.output, outcome.recordFile, request.json);
}
async function selectedCase(
	benchmarkCase: BenchmarkCase,
	config: BenchmarkConfig,
): Promise<BenchmarkCase> {
	if (config.pipelinePath === benchmarkCase.pipelinePath) {
		return benchmarkCase;
	}

	return await withPipeline(benchmarkCase, config.pipelinePath);
}
export { runPipelineCase as default };
