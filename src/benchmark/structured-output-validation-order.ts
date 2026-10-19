import type { z } from "zod";

import {
	judgeGradeResponseSchema,
	productAnswerSchema,
	stageJudgeResponseSchema,
	stageTurnSchema,
} from "./contracts";
import type { ValidationFieldOrder } from "./validation-issue-order";

const evidenceValidationOrder: ValidationFieldOrder = {
	fields: ["source", "path", "claim", "quote"],
};

const requirementValidationOrder: ValidationFieldOrder = {
	children: { evidence: evidenceValidationOrder },
	fields: ["id", "status", "evidence"],
};

// Validation failures become provider correction feedback, so their historical
// order is part of the measured prompt rather than schema declaration style.
const structuredOutputValidationOrder: ReadonlyMap<
	z.ZodType,
	ValidationFieldOrder
> = new Map<z.ZodType, ValidationFieldOrder>([
	[stageTurnSchema, { fields: ["status", "message"] }],
	[productAnswerSchema, { fields: ["answer"] }],
	[
		judgeGradeResponseSchema,
		{
			children: { requirements: requirementValidationOrder },
			fields: ["requirements", "verdict", "summary"],
		},
	],
	[
		stageJudgeResponseSchema,
		{
			children: {
				dimensions: {
					children: { evidence: evidenceValidationOrder },
					fields: ["id", "grade", "evidence"],
				},
				hardBlockers: requirementValidationOrder,
				requirements: requirementValidationOrder,
			},
			fields: ["hardBlockers", "requirements", "dimensions", "summary"],
		},
	],
]);

export { structuredOutputValidationOrder as default };
