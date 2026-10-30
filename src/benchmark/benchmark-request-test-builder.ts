import type { BenchmarkConfig } from "./config";

class BenchmarkRequestBuilder {
	readonly #values: Partial<BenchmarkConfig>;
	public constructor(values: Partial<BenchmarkConfig> = {}) {
		this.#values = values;
	}
	public build(): BenchmarkConfig {
		return {
			caseId: "audit-log",
			effort: "medium",
			judgeModel: "opus",
			model: "sonnet",
			pause: false,
			pipelinePath: "pipelines/test.json",
			sessionBudgetUsd: 5,
			sourceDir: "/target",
			...this.#values,
		};
	}
}
export { BenchmarkRequestBuilder as default };
