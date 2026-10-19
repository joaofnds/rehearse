import type { PipelineDefinition } from "#benchmark/pipeline";

const FINAL_STAGE_INDEX_ADJUSTMENT = 1;

function stageDefinitions(
	names: readonly string[],
): PipelineDefinition["stages"] {
	return names.map((name, index) =>
		index === names.length - FINAL_STAGE_INDEX_ADJUSTMENT
			? {
					kind: "delivery",
					name,
					rubric: `cases/pipe-case/rubrics/${name}.json`,
					skill: name,
				}
			: {
					kind: "planning",
					name,
					requiresAcceptanceCriteria: false,
					rubric: `cases/pipe-case/rubrics/${name}.json`,
					skill: name,
				},
	);
}

class PipelineDefinitionBuilder {
	public constructor(
		private readonly props: Partial<PipelineDefinition> = {},
	) {}

	public withStageNames(names: readonly string[]): PipelineDefinitionBuilder {
		return new PipelineDefinitionBuilder({
			...this.props,
			stages: stageDefinitions(names),
		});
	}

	public build(): PipelineDefinition {
		return {
			stages: this.props.stages ?? stageDefinitions(["discuss", "build"]),
			statuses: ["To Do", "Done"],
			target: {
				checks: [{ command: ["bun", "run", "typecheck"] }],
				integrityFiles: ["package.json"],
			},
			...this.props,
		};
	}
}

export { PipelineDefinitionBuilder as default };
