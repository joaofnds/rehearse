import { z } from "zod";

import type { Immutable } from "./contracts";
import {
	dimensionFields,
	judgeEvidenceListSchema,
	judgeEvidenceSchema,
	passFailFields,
	recordedEvidenceListSchema,
	recordedEvidenceSchema,
} from "./judge-evidence-contract";
import { REQUIRED_LIST_MINIMUM_ITEMS } from "./stage-rubric-contract";

const verdictFields = {
	summary: z.string().nonempty(),
	verdict: z.enum(["PASS", "FAIL"]),
};

const judgeRequirementResponseSchema = z.object({
	...passFailFields,
	evidence: z.array(judgeEvidenceSchema).min(REQUIRED_LIST_MINIMUM_ITEMS),
});

const judgeGradeResponseSchema = z.object({
	requirements: z.array(judgeRequirementResponseSchema),
	...verdictFields,
});

const recordedRequirementSchema = z.object({
	...passFailFields,
	evidence: z.array(recordedEvidenceSchema).min(REQUIRED_LIST_MINIMUM_ITEMS),
});

const judgeGradeSchema = z.object({
	requirements: z.array(recordedRequirementSchema),
	...verdictFields,
});

const stageJudgeDimensionResponseSchema = z.object({
	...dimensionFields,
	evidence: judgeEvidenceListSchema,
});

const stageJudgeDimensionOutputSchema = z.object({
	...dimensionFields,
	evidence: recordedEvidenceListSchema,
});

const stageJudgeResponseSchema = z.object({
	dimensions: z.array(stageJudgeDimensionResponseSchema),
	hardBlockers: z.array(
		z.object({ ...passFailFields, evidence: judgeEvidenceListSchema }),
	),
	requirements: z.array(
		z.object({ ...passFailFields, evidence: judgeEvidenceListSchema }),
	),
	summary: z.string().nonempty(),
});

const stageJudgeOutputSchema = z.object({
	dimensions: z.array(stageJudgeDimensionOutputSchema),
	hardBlockers: z.array(
		z.object({ ...passFailFields, evidence: recordedEvidenceListSchema }),
	),
	requirements: z.array(
		z.object({ ...passFailFields, evidence: recordedEvidenceListSchema }),
	),
	summary: z.string().nonempty(),
});

type JudgeGrade = Immutable<z.infer<typeof judgeGradeSchema>>;

type JudgeGradeResponse = Immutable<z.infer<typeof judgeGradeResponseSchema>>;

type StageJudgeOutput = Immutable<z.infer<typeof stageJudgeOutputSchema>>;

type StageJudgeResponse = Immutable<z.infer<typeof stageJudgeResponseSchema>>;

export {
	judgeGradeResponseSchema,
	judgeGradeSchema,
	stageJudgeDimensionResponseSchema,
	stageJudgeDimensionOutputSchema,
	stageJudgeResponseSchema,
	stageJudgeOutputSchema,
};
export type {
	JudgeGrade,
	JudgeGradeResponse,
	StageJudgeOutput,
	StageJudgeResponse,
};
