import { z } from "zod";

import { stageLetterGradeSchema } from "#benchmark/contracts";
import type { Immutable, StageLetterGrade } from "#benchmark/contracts";
import type { GradedStageRef, OperatorGrade } from "#benchmark/operator-grade";
import type createCalibrationApp from "#server/calibration";
import type {
	HTTP_STATUS_BAD_REQUEST,
	HTTP_STATUS_CONFLICT,
	HTTP_STATUS_NOT_FOUND,
} from "#server/http-status";
import { judgedGradeSchema } from "#server/stage-record";

/** A malformed request is 400, a stage that is not there 404, and a stage already graded 409. */
class CalibrationRefusalError extends Error {
	public override name = "CalibrationRefusalError";

	public constructor(
		public readonly status:
			| typeof HTTP_STATUS_BAD_REQUEST
			| typeof HTTP_STATUS_NOT_FOUND
			| typeof HTTP_STATUS_CONFLICT,
		message: string,
	) {
		super(message);
	}
}

const judgeGradeSchema = judgedGradeSchema.extend({
	grade: stageLetterGradeSchema,
	summary: z.string(),
});

interface CalibrationDependencies {
	readonly runsDirectory: string;
}

type JudgeGrade = Immutable<z.infer<typeof judgeGradeSchema>>;

interface Criterion {
	readonly id: string;
	readonly description?: string;
}

interface DimensionCriterion extends Criterion {
	readonly good?: string;
	readonly excellent?: string;
}

/** What the operator grades: the rubric's criteria, or only their ids where the record kept no rubric. */
interface StageCriteria {
	readonly hardBlockers: readonly Criterion[];
	readonly requirements: readonly Criterion[];
	readonly dimensions: readonly DimensionCriterion[];
}

interface JudgedStage {
	readonly judgeContractSha256: string | undefined;
	readonly judgeModel: string | undefined;
	readonly rubricSha256: string | undefined;
	readonly criteria: StageCriteria;
	readonly input: Readonly<Record<string, string>>;
	readonly judgeGrade: JudgeGrade;
}

/** A stage whose record carries a Judge letter, which is what makes it gradeable. */
interface GradeableStage extends JudgedStage {
	readonly ref: GradedStageRef;
	readonly stageName: string;
	/** The run's or replay's own time; a confirmation group records none. */
	readonly recordedTime: string | undefined;
}

interface GradedStage {
	readonly stage: GradeableStage;
	readonly operatorGrade: OperatorGrade;
}

interface CriterionDifference {
	readonly criterion: string;
	readonly judge: string;
	readonly operator: string;
}

interface CriterionGrades {
	readonly hardBlockers: readonly {
		readonly id: string;
		readonly status: string;
	}[];
	readonly requirements: readonly {
		readonly id: string;
		readonly status: string;
	}[];
	readonly dimensions: readonly {
		readonly id: string;
		readonly grade: string;
	}[];
}

interface AgreementRow {
	readonly stage: GradedStageRef;
	readonly stageName: string;
	readonly judgeModel: string | null;
	readonly judgeGrade: StageLetterGrade;
	readonly operatorGrade: StageLetterGrade;
	readonly stepsApart: number;
	readonly differences: readonly CriterionDifference[];
	readonly note: string | null;
}

interface DimensionDrift {
	readonly dimension: string;
	readonly steps: number;
}

interface DriftGroup {
	readonly judgeContractSha256: string;
	readonly judgeModel: string | null;
	readonly stage: string;
	readonly rubricSha256: string | null;
	readonly reviews: number;
	readonly drift: readonly DimensionDrift[];
}

type CalibrationRoutes = ReturnType<typeof createCalibrationApp>;

export type {
	CalibrationDependencies,
	JudgeGrade,
	StageCriteria,
	JudgedStage,
	GradeableStage,
	GradedStage,
	CriterionDifference,
	CriterionGrades,
	AgreementRow,
	DimensionDrift,
	DriftGroup,
	CalibrationRoutes,
};

export { CalibrationRefusalError, judgeGradeSchema };
