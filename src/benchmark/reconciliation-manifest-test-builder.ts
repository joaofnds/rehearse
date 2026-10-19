import type { RunManifest } from "./manifest";
import { TEST_TARGET } from "./test-support";

class ReconciliationManifestBuilder {
	readonly #values: Partial<RunManifest>;
	public constructor(values: Partial<RunManifest> = {}) {
		this.#values = values;
	}
	public build(): RunManifest {
		const sourceRoot = this.#values.sourceRoot ?? "/target";
		return {
			caseId: "audit-log",
			controlSha: "control-sha",
			judgeModel: "opus",
			model: "sonnet",
			pipeline: {
				stages: [
					{
						kind: "delivery",
						name: "build",
						rubric: "rubrics/build.json",
						skill: "build",
					},
				],
				statuses: ["To Do", "Done"],
				target: TEST_TARGET,
			},
			pipelinePath: "pipelines/default.json",
			productBrief: "Brief text",
			sessionBudgetUsd: 5,
			sourceRoot,
			sourceSha: "source-sha",
			task: "Task text",
			taskId: "TASK-1",
			taskSha: "task-sha",
			timestamp: "2026-08-30T00:00:00.000Z",
			...this.#values,
		};
	}
}
export { ReconciliationManifestBuilder as default };
