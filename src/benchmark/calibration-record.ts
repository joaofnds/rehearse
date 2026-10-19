import { z } from "zod";

import { effortSchema } from "./config";
import type { Immutable } from "./contracts";
import {
	contextFileSchema,
	judgeAttemptListSchema,
	judgeGradeSchema,
	localCheckResultSchema,
	stageGradeSchema,
	stageJudgeInputSchema,
	stageRubricSchema,
	stageScorecardSchema,
} from "./contracts";

/**
 * What `calibrate` reads back out of a run's own records: the frozen evidence
 * a rejudge is applied to, and the knobs the Judges ran under. Loose at the
 * top level, because the artifact carries far more than this and a reader that
 * refused the rest would refuse every artifact a later card adds a field to.
 *
 * The effort and the budget are optional because a stage record written before
 * they were recorded carries neither, and its evidence was still paid for. A
 * rejudge needs a budget and refuses when the record has none; a calibration
 * that rejudges nothing needs neither.
 */
const judgeKnobsSchema = z.object({
	judgeEffort: effortSchema.optional(),
	judgeModel: z.string().nonempty(),
	sessionBudgetUsd: z.number().positive().optional(),
});

const calibratableArtifactSchema = judgeKnobsSchema
	.extend({
		baselineContext: z.array(contextFileSchema),
		caseId: z.string().nonempty(),
		changedPaths: z.array(z.string()),
		checkIntegrity: localCheckResultSchema,
		diff: z.string(),
		grade: judgeGradeSchema,
		instructions: z.string(),
		localChecks: localCheckResultSchema,
		resultSha: z.string().nonempty(),
		reviewFile: z.string().nonempty(),
		rubric: z.string().nonempty(),
		sourceRoot: z.string().nonempty(),
		stageScorecards: z.array(stageScorecardSchema),
		status: z.enum(["AWAITING_HUMAN_REVIEW", "COMPLETE", "FAILED"]),
	})
	.loose();

/**
 * A stopped stage's own record. It carries the Judge model only since the
 * card that started recording it, and `calibrate` needs one to name the
 * agreement baseline, so a record without it is refused rather than guessed.
 */
const calibratableStageRecordSchema = judgeKnobsSchema
	.extend({
		attempts: judgeAttemptListSchema,
		calibration: z.unknown().optional(),
		costUsd: z.number(),
		grade: stageGradeSchema,
		input: stageJudgeInputSchema,
		prompt: z.string(),
		rubric: stageRubricSchema,
		rubricPath: z.string().nonempty(),
		stage: z.string().nonempty(),
	})
	.loose();

type CalibratableArtifact = Immutable<
	z.infer<typeof calibratableArtifactSchema>
>;

type CalibratableStageRecord = Immutable<
	z.infer<typeof calibratableStageRecordSchema>
>;

export { calibratableArtifactSchema, calibratableStageRecordSchema };
export type { CalibratableArtifact, CalibratableStageRecord };
