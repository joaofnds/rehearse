import { z } from "zod";

import { STAGE_LETTER_GRADES } from "./config";
import type { Immutable } from "./contracts";

const REQUIRED_TEXT_MINIMUM_CODE_UNITS = 1;

const REQUIRED_LIST_MINIMUM_ITEMS = 1;

const stageLetterGradeSchema = z.enum(STAGE_LETTER_GRADES);

const stageRubricItemSchema = z.object({
	description: z.string().nonempty(),
	id: z.string().nonempty(),
});

const stageRubricDimensionSchema = stageRubricItemSchema.extend({
	excellent: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
	good: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
});

const stageRubricSchema = z.object({
	dimensions: z
		.array(stageRubricDimensionSchema)
		.min(REQUIRED_LIST_MINIMUM_ITEMS),
	hardBlockers: z.array(stageRubricItemSchema),
	requirements: z.array(stageRubricItemSchema).nonempty(),
});

type StageLetterGrade = z.infer<typeof stageLetterGradeSchema>;

type StageRubric = Immutable<z.infer<typeof stageRubricSchema>>;

export {
	stageLetterGradeSchema,
	stageRubricItemSchema,
	stageRubricDimensionSchema,
	stageRubricSchema,
	REQUIRED_LIST_MINIMUM_ITEMS,
};
export type { StageLetterGrade, StageRubric };
