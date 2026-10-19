import type { TargetDefinition } from "./pipeline";

interface RawPipelineDefinition {
	readonly stages: readonly unknown[];
	readonly statuses: readonly string[];
	readonly target: TargetDefinition;
}
class PipelineDefinitionBuilder {
	readonly #values: Partial<RawPipelineDefinition>;
	public constructor(values: Partial<RawPipelineDefinition> = {}) {
		this.#values = values;
	}
	public build(): RawPipelineDefinition {
		return {
			stages: [],
			statuses: ["To Do", "Done"],
			target: {
				checks: [
					{
						command: ["bun", "run", "check"],
						env: { CONFIG_PATH: "config/test.yaml" },
					},
				],
				integrityFiles: ["package.json", "config/check.json"],
			},
			...this.#values,
		};
	}
	public json(): string {
		return JSON.stringify(this.build());
	}
}
const availableRubrics = [
	"rubrics/discuss.json",
	"rubrics/grill.json",
	"rubrics/plan.json",
	"rubrics/build.json",
];
export { PipelineDefinitionBuilder, availableRubrics };
