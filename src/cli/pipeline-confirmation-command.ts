import type { BenchmarkCase } from "#benchmark/case";
import type { BenchmarkConfig } from "#benchmark/config";
import {
	liveCorpusSource,
	readCorpusInstructions,
} from "#benchmark/corpus-file";
import { validateRubricDefinition } from "#benchmark/judge";
import runPipelineConfirmation from "#benchmark/pipeline-confirmation";
import type { LoadedStageSettings } from "#benchmark/stage-settings";
import { assertControlReady, assertSourceReady } from "#benchmark/target";
import type { CommandOutput } from "#cli/output";

import type { ConfirmationApproval } from "./pipeline-confirmation-request";
import buildConfirmationRequest from "./pipeline-confirmation-request";
import PipelineConfirmationRuntime from "./pipeline-confirmation-runtime";

interface PipelineConfirmationInputs {
	readonly config: BenchmarkConfig;
	readonly benchmarkCase: BenchmarkCase;
	readonly loadedSettings: LoadedStageSettings;
}

interface PipelineConfirmationApproval {
	readonly confirmation: ConfirmationApproval;
	readonly output: CommandOutput;
	readonly spendCeilingUsd: number;
}

async function confirmRun(
	{ config, benchmarkCase, loadedSettings }: PipelineConfirmationInputs,
	{ confirmation, output, spendCeilingUsd }: PipelineConfirmationApproval,
): Promise<Awaited<ReturnType<typeof runPipelineConfirmation>>> {
	const corpusSource = liveCorpusSource();
	const [controlSha, source, instructions] = await Promise.all([
		assertControlReady(),
		assertSourceReady(config.sourceDir),
		readCorpusInstructions(corpusSource),
	]);
	validateRubricDefinition(benchmarkCase.finalRubric);

	return await runPipelineConfirmation(
		new PipelineConfirmationRuntime({ config, corpusSource, output }),
		buildConfirmationRequest({
			benchmarkCase,
			config,
			confirmation,
			controlSha,
			corpusSource,
			instructions,
			loadedSettings,
			source,
			spendCeilingUsd,
		}),
	);
}

export { confirmRun as default };
