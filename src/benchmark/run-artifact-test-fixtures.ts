import type { BenchmarkConfig } from "./config";
import type { PipelineDefinition } from "./pipeline";
import type { RunArtifactBaseInputs } from "./run-artifact";
import {
	AUDIT_LOG_PIPELINE_PATH,
	TEST_TARGET,
	harnessResult,
} from "./test-support";

const DEFAULT_CONFIGURATION: BenchmarkConfig = {
	caseId: "audit-log",
	effort: "medium",
	judgeModel: "sonnet",
	model: "sonnet",
	pause: false,
	pipelinePath: AUDIT_LOG_PIPELINE_PATH,
	sessionBudgetUsd: 5,
	sourceDir: "/tmp/target",
};
class RunArtifactBaseInputsBuilder {
	#overrides: Partial<RunArtifactBaseInputs>;
	#configuration: BenchmarkConfig;
	public constructor(overrides: Partial<RunArtifactBaseInputs> = {}) {
		this.#overrides = overrides;
		this.#configuration = overrides.config ?? { ...DEFAULT_CONFIGURATION };
	}
	public withPipeline(
		pipeline: PipelineDefinition,
		pipelinePath: string,
	): this {
		this.#configuration = { ...this.#configuration, pipelinePath };
		this.#overrides = {
			...this.#overrides,
			config: this.#configuration,
			pipeline,
		};

		return this;
	}
	public build(): RunArtifactBaseInputs {
		return {
			baselineContext: [],
			checkpoints: [],
			claudeVersion: "claude 1.0.0",
			config: this.#configuration,
			controlSha: "control-sha",
			evidence: {
				changedPaths: ["src/example.ts"],
				checkIntegrity: harnessResult("PASS", "checks match"),
				diff: "the-diff",
				localChecks: harnessResult("PASS", "all green"),
				resultSha: "result-sha",
				taskState: "state",
			},
			instructions: "Instructions",
			pipeline: {
				stages: [],
				statuses: ["To Do", "Done"],
				target: TEST_TARGET,
			},
			productBrief: "Brief",
			productOwner: {
				providerCalls: [],
				sessionId: "po",
				spentUsd: 0,
			},
			rubric: "Rubric",
			rubricIds: ["scope"],
			source: {
				origin: undefined,
				root: "/tmp/target",
				sha: "source-sha",
				targetRoot: "/tmp/target",
			},
			stageScorecards: [],
			task: "Task",
			taskId: "TASK-1",
			taskSha: "task-sha",
			timestamp: "2026-08-30T00:00:00.000Z",
			workflow: [],
			...this.#overrides,
		};
	}
}
export default RunArtifactBaseInputsBuilder;
