import type { Immutable } from "#benchmark/contracts";
import type { OperatorGrade } from "#benchmark/operator-grade";

class OperatorGradeBuilder {
	public constructor(
		private readonly props: Immutable<Partial<OperatorGrade>> = {},
	) {}

	public build(): OperatorGrade {
		return {
			dimensions: [
				{ grade: "B", id: "clarity" },
				{ grade: "B", id: "decision-quality" },
			],
			hardBlockers: [{ id: "invalid-stage-delivery", status: "PASS" }],
			requirements: [{ id: "goal-stated", status: "PASS" }],
			...this.props,
		};
	}
}

export { OperatorGradeBuilder as default };
