import { z } from "zod";

import { stageLetterGradeSchema } from "./contracts";

const sectionCountSchema = z.object({
	returned: z.number().int().nonnegative(),
	total: z.number().int().nonnegative(),
});

const returnedBlockerSchema = z.object({
	id: z.string(),
	status: z.enum(["PASS", "FAIL"]).optional(),
});

const returnedDimensionSchema = z.object({
	grade: stageLetterGradeSchema.optional(),
	id: z.string(),
});

/**
 * Every rubric item of a section in rubric order, each with its result once
 * it has returned and nothing while it is pending.
 */
const returnedItemsSchema = z.object({
	dimensions: z.array(returnedDimensionSchema).readonly(),
	hardBlockers: z.array(returnedBlockerSchema).readonly(),
});

/**
 * How far a stage judge's output has come back, counted per rubric section
 * from the items that closed and passed their own checks. A rejected attempt
 * withdraws its counts, and the next attempt starts again from none. The
 * items are undefined on progress recorded before they existed.
 */
const judgeProgressSchema = z.discriminatedUnion("state", [
	z.object({
		attempt: z.number().int().positive(),
		items: returnedItemsSchema.optional(),
		sections: z.object({
			dimensions: sectionCountSchema,
			hardBlockers: sectionCountSchema,
			requirements: sectionCountSchema,
		}),
		state: z.literal("returning"),
	}),
	z.object({
		attempt: z.number().int().positive(),
		reason: z.string(),
		state: z.literal("rejected"),
	}),
]);

type JudgeProgress = z.infer<typeof judgeProgressSchema>;
type JudgeSectionCount = z.infer<typeof sectionCountSchema>;
type ReturnedItems = z.infer<typeof returnedItemsSchema>;

export { judgeProgressSchema as default };
export type { JudgeProgress, JudgeSectionCount, ReturnedItems };
