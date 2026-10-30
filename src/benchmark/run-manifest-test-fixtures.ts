import { parseArgs } from "./config";
import type { BenchmarkConfig } from "./config";
import type { PipelineDefinition } from "./pipeline";
import type { RunManifestInputs } from "./run-manifest";
import { AUDIT_LOG_PIPELINE_PATH } from "./test-support";

const SHA256_HEX_DIGITS = 64;

function manifestConfig(
	minimumGrade?: BenchmarkConfig["minimumStageGrade"],
): BenchmarkConfig {
	const base = [
		"--target",
		"/tmp/target",
		"--model",
		"sonnet",
		"--effort",
		"medium",
		"--session-budget-usd",
		"5",
	];
	const args =
		minimumGrade === undefined
			? base
			: [...base, "--minimum-grade", minimumGrade];
	return parseArgs(
		args,
		{},
		{
			caseId: "audit-log",
			pipelinePath: AUDIT_LOG_PIPELINE_PATH,
			targetPath: "/tmp/target",
		},
	);
}
function runManifestInputs(
	config: BenchmarkConfig,
	pipeline: PipelineDefinition,
): RunManifestInputs {
	return {
		config,
		controlSha: "control-sha",
		corpusVersion: { digest: "0".repeat(SHA256_HEX_DIGITS), kind: "version" },
		pipeline,
		productBrief: "Brief",
		source: {
			root: "/tmp/target",
			sha: "source-sha",
			targetRoot: "/tmp/target",
		},
		spendCeilingUsd: 100,
		task: "Task",
		taskId: "TASK-1",
		taskSha: "task-sha",
		timestamp: "2026-09-02T00:00:00.000Z",
	};
}
export { manifestConfig, runManifestInputs };
