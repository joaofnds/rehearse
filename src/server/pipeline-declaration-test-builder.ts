import type { PipelineCaseDeclaration } from "#benchmark/case";

class PipelineDeclarationBuilder {
	public constructor(
		private readonly props: Partial<PipelineCaseDeclaration> = {},
	) {}

	public build(): PipelineCaseDeclaration {
		const identity = {
			finalRubric: "rubric.md",
			id: "pipe-case",
			kind: "pipeline" as const,
		};
		const modeled =
			this.props.model === undefined
				? identity
				: { ...identity, model: this.props.model };
		const inputs = {
			...modeled,
			pipeline: "pipeline.json",
			productBrief: "brief.md",
			rubrics: "rubrics",
		};
		const budgeted =
			this.props.sessionBudgetUsd === undefined
				? inputs
				: { ...inputs, sessionBudgetUsd: this.props.sessionBudgetUsd };

		return {
			...budgeted,
			target: { path: "/target" },
			task: "task.md",
			title: "A pipeline case",
			...this.props,
		};
	}
}

export { PipelineDeclarationBuilder as default };
