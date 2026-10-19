import { z } from "zod";

import type { Immutable } from "#benchmark/contracts";
import {
	stageLetterGradeSchema,
	stageRubricSchema,
} from "#benchmark/contracts";
import { jsonValueSchema } from "#benchmark/json-value";
import { stageRubricSha256 } from "#benchmark/judge-agreement";
import type { JudgedStage } from "#server/calibration-contract";
import { judgeGradeSchema } from "#server/calibration-contract";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";
import { judgedGradeSchema } from "#server/stage-record";

/** Each input field as the operator reads it: a string as recorded, anything else as indented JSON. */
const inputTextSchema = z.record(
	z.string(),
	z.union([
		z.string(),
		jsonValueSchema.transform((value) =>
			JSON.stringify(value, null, RECORD_JSON_INDENT_SPACES),
		),
	]),
);

const scorecardSchema = z.looseObject({
	grade: judgeGradeSchema,
	input: inputTextSchema,
	judgeModel: z.string().nonempty().optional(),
	rubric: stageRubricSchema,
});

/** A stage that stopped the run keeps its judged items at the top level and records no rubric. */
const stopRecordSchema = judgedGradeSchema.extend({
	grade: z.looseObject({ grade: stageLetterGradeSchema }),
	input: inputTextSchema,
	judgeModel: z.string().nonempty().optional(),
	status: z.literal("STAGE_JUDGE_FAILED"),
	summary: z.string(),
});

const manifestJudgeModelSchema = z
	.looseObject({ judgeModel: z.string().nonempty() })
	.transform(({ judgeModel }) => judgeModel);

const groupJudgeModelSchema = z
	.looseObject({ inputs: z.looseObject({ judgeModel: z.string().nonempty() }) })
	.transform(({ inputs }) => inputs.judgeModel);

const judgedStageSchema = z.union([
	stopRecordSchema.transform((stop): JudgedStage => ({
		criteria: {
			dimensions: stop.dimensions.map(({ id }) => ({ id })),
			hardBlockers: stop.hardBlockers.map(({ id }) => ({ id })),
			requirements: stop.requirements.map(({ id }) => ({ id })),
		},
		input: stop.input,
		judgeGrade: {
			dimensions: stop.dimensions,
			grade: stop.grade.grade,
			hardBlockers: stop.hardBlockers,
			requirements: stop.requirements,
			summary: stop.summary,
		},
		judgeModel: stop.judgeModel,
		rubricSha256: undefined,
	})),
	scorecardSchema.transform((scorecard): JudgedStage => ({
		criteria: scorecard.rubric,
		input: scorecard.input,
		judgeGrade: scorecard.grade,
		judgeModel: scorecard.judgeModel,
		rubricSha256: stageRubricSha256(scorecard.rubric),
	})),
]);

const replayScorecardSchema = z.looseObject({
	judgeModel: z.string().nonempty(),
	scorecard: judgedStageSchema,
	stage: z.string().nonempty(),
});

type CalibrationScorecardInput = Immutable<z.input<typeof scorecardSchema>>;

export {
	manifestJudgeModelSchema,
	groupJudgeModelSchema,
	judgedStageSchema,
	replayScorecardSchema,
};

export type { CalibrationScorecardInput };
