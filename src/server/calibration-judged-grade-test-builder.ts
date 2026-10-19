import type { Immutable } from "#benchmark/contracts";
import { JUDGE_CLAIM } from "#server/calibration-case-test-data";
import type { JudgedGrade } from "#server/stage-record";

class JudgedGradeBuilder {
	public constructor(
		private readonly props: Immutable<Partial<JudgedGrade>> = {},
	) {}

	public build(): Immutable<JudgedGrade> {
		return {
			dimensions: [
				{ evidence: [], grade: "B", id: "clarity" },
				{ evidence: [], grade: "B", id: "decision-quality" },
			],
			hardBlockers: [
				{
					evidence: [
						{ claim: JUDGE_CLAIM, path: "task", source: "task-state" },
					],
					id: "invalid-stage-delivery",
					status: "PASS",
				},
			],
			requirements: [{ evidence: [], id: "goal-stated", status: "PASS" }],
			...this.props,
		};
	}
}

export { JudgedGradeBuilder as default };
