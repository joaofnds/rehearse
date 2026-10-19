import type { Immutable } from "#benchmark/contracts";
import { INPUT, RUBRIC } from "#server/calibration-case-test-data";
import type { CalibrationScorecardInput } from "#server/calibration-gradeable-schema";
import StageGradeBuilder from "#server/calibration-stage-grade-test-builder";

class CalibrationScorecardBuilder {
	public constructor(
		private readonly props: Immutable<Partial<CalibrationScorecardInput>> = {},
	) {}

	public build(): CalibrationScorecardInput {
		return {
			grade: new StageGradeBuilder().build(),
			input: INPUT,
			rubric: RUBRIC,
			...this.props,
		};
	}
}

export { CalibrationScorecardBuilder as default };
