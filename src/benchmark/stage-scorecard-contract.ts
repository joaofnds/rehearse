import { z } from "zod";

import { claudeCallMetricsSchema } from "./claude-envelope-contract";
import { stageJudgeOutputSchema } from "./judge-grade-contract";
import {
	stageLetterGradeSchema,
	stageRubricSchema,
} from "./stage-rubric-contract";
import { stageJudgeInputSchema } from "./workflow-stage-contract";

const judgeAttemptOutcomeSchema = z.union([
	z.looseObject({ outcome: z.literal("ACCEPTED") }),
	z.looseObject({ error: z.string(), outcome: z.literal("REJECTED") }),
]);

const judgeAttemptPayloadSchema = z.looseObject({
	costUsd: z.number(),
	metrics: claudeCallMetricsSchema.optional(),
	payload: z.unknown(),
});

const judgeAttemptSchema = z.intersection(
	judgeAttemptPayloadSchema,
	judgeAttemptOutcomeSchema,
);

const judgeAttemptListSchema = z.array(judgeAttemptSchema);

const stageGradeSchema = stageJudgeOutputSchema
	.extend({
		grade: stageLetterGradeSchema,
		verdict: z.enum(["CONTINUE", "STOP"]),
	})
	.loose();

const stageScorecardSchema = z
	.object({
		attempts: judgeAttemptListSchema,
		costUsd: z.number(),
		grade: stageGradeSchema,
		input: stageJudgeInputSchema,
		prompt: z.string(),
		rubric: stageRubricSchema,
		rubricPath: z.string().nonempty(),
		stage: z.string().nonempty(),
	})
	.loose();

export {
	judgeAttemptOutcomeSchema,
	judgeAttemptPayloadSchema,
	judgeAttemptListSchema,
	stageGradeSchema,
	stageScorecardSchema,
};
