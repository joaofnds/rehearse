import type { z } from "zod";

import type {
	Immutable,
	StageLetterGrade,
	stageGradeSchema,
} from "#benchmark/contracts";
import { JUDGE_SUMMARY } from "#server/calibration-case-test-data";
import JudgedGradeBuilder from "#server/calibration-judged-grade-test-builder";

type RecordedStageGrade = Immutable<z.input<typeof stageGradeSchema>>;

class StageGradeBuilder {
	public constructor(
		private readonly props: Immutable<Partial<RecordedStageGrade>> = {},
	) {}

	public build(): RecordedStageGrade {
		const items = new JudgedGradeBuilder().build();
		const dimensions = this.props.dimensions ?? items.dimensions;

		let grade: StageLetterGrade = "A";
		for (const { grade: dimensionGrade } of dimensions) {
			if (dimensionGrade > grade) {
				grade = dimensionGrade;
			}
		}

		return {
			...items,
			grade,
			summary: JUDGE_SUMMARY,
			verdict: "CONTINUE",
			...this.props,
		};
	}
}

export { StageGradeBuilder as default };
