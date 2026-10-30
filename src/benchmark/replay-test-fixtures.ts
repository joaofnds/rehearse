import type { TargetDefinition } from "./pipeline";
import type { ReplayRequest } from "./replay";
import type { RecordedRun } from "./replay-saved-run-test-builder";
import { POSTGRES } from "./target-services-test-support";
import { TEST_TARGET } from "./test-support";

class ReplayRequestBuilder {
	readonly #overrides: Partial<Omit<ReplayRequest, "paths">>;
	public constructor(overrides: Partial<Omit<ReplayRequest, "paths">> = {}) {
		this.#overrides = overrides;
	}
	public build(paths: RecordedRun["paths"]): ReplayRequest {
		return {
			controlSha: "control-sha",
			corpusSource: { backingRoot: "/backing", kind: "live", root: "/live" },
			declaredTargetRoot: undefined,
			instructions: "Current instructions",
			judgeModel: "opus",
			model: "sonnet",
			paths,
			sessionBudgetUsd: 5,
			setup: undefined,
			spendCeilingUsd: 100,
			stage: "build",
			...this.#overrides,
		};
	}
}

const SERVED_TARGET: TargetDefinition = {
	...TEST_TARGET,
	checks: [{ command: ["bun", "test"] }],
	services: [POSTGRES],
	setup: [{ command: ["bun", "install"] }],
};
const SERVED = { DATABASE_URL: "postgres://127.0.0.1:49152/app" };

export { SERVED_TARGET, SERVED, ReplayRequestBuilder };
