import type { ComparisonProjectionInput } from "./comparison-evidence";
import { PASS, comparisonReps } from "./comparison-test-fixtures";

const ALL_PASSED = [PASS, PASS, PASS, PASS];

class ComparisonProjectionBuilder {
	public constructor(
		private readonly props: Partial<ComparisonProjectionInput> = {},
	) {}

	public build(): ComparisonProjectionInput {
		return {
			cases: this.props.cases ?? [
				{
					arms: {
						baseline: comparisonReps("case-1", "baseline", {
							outcomes: ALL_PASSED,
						}),
						candidate: comparisonReps("case-1", "candidate", {
							outcomes: ALL_PASSED,
						}),
						control: comparisonReps("case-1", "control", {
							outcomes: ALL_PASSED,
						}),
					},
					caseId: "case-1",
				},
			],
			contract: this.props.contract ?? {
				declaredStages: ["discuss", "build"],
				mode: "pipeline",
				reps: 4,
			},
		};
	}
}

export { ComparisonProjectionBuilder as default };
