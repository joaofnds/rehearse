import { z } from "zod";

import type { Immutable } from "./contracts";

const humanFindingSchema = z
	.object({
		description: z.string().nonempty(),
		judgeAssessment: z.enum([
			"CAUGHT",
			"MISSED",
			"FALSE_POSITIVE",
			"NOT_PROMOTED",
		]),
		paths: z.array(z.string().nonempty()),
		rubricId: z.string().nonempty().nullable(),
		stage: z.string().nonempty().default("final"),
	})
	.superRefine((finding, context) => {
		if (
			finding.judgeAssessment === "NOT_PROMOTED" ||
			finding.rubricId !== null
		) {
			return;
		}

		context.addIssue({
			code: "custom",
			message: "Judge-related findings require a rubric ID",
			path: ["rubricId"],
		});
	});

const humanReviewSchema = z.object({
	findings: z.array(humanFindingSchema),
	summary: z.string().nonempty(),
	verdict: z.enum(["ACCEPT", "REJECT"]),
});

type HumanReview = Immutable<z.infer<typeof humanReviewSchema>>;

export { humanFindingSchema, humanReviewSchema };
export type { HumanReview };
