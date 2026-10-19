import type { BenchmarkConfig } from "./config";
import type { LocalCheckResult } from "./contracts";
import type { CorpusMeasurement } from "./corpus-measurement";
import type { RunManifest } from "./manifest";
import type { PipelineDefinition } from "./pipeline";
import type { RunSource } from "./run-artifact";

interface RunManifestInputs {
	readonly timestamp: string;
	readonly controlSha: string;
	readonly source: RunSource;
	readonly taskId: string;
	readonly taskSha: string;
	readonly task: string;
	readonly productBrief: string;
	readonly config: BenchmarkConfig;
	readonly pipeline: PipelineDefinition;
	readonly baselineChecks?: LocalCheckResult | undefined;
	readonly spendCeilingUsd: number;
	readonly corpusVersion: CorpusMeasurement;
}

function buildRunManifest(inputs: RunManifestInputs): RunManifest {
	const { config, source } = inputs;

	return {
		baselineChecks: inputs.baselineChecks,
		caseId: config.caseId,
		controlSha: inputs.controlSha,
		corpusVersion: inputs.corpusVersion,
		effort: config.effort,
		judgeEffort: config.judgeEffort,
		judgeModel: config.judgeModel,
		minimumGrade: config.minimumStageGrade,
		model: config.model,
		pipeline: inputs.pipeline,
		pipelinePath: config.pipelinePath,
		productBrief: inputs.productBrief,
		sessionBudgetUsd: config.sessionBudgetUsd,
		sourceRoot: source.root,
		sourceSha: source.sha,
		spendCeilingUsd: inputs.spendCeilingUsd,
		targetRoot: source.targetRoot,
		task: inputs.task,
		taskId: inputs.taskId,
		taskSha: inputs.taskSha,
		timestamp: inputs.timestamp,
	};
}

export { buildRunManifest as default };

export type { RunManifestInputs };
