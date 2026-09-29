import { z } from "zod";
import { stageLetterGradeSchema } from "./contracts";
import type { Immutable } from "./contracts";
import type { OutputWords } from "./output-words";
import { stageOutputWords } from "./output-words";

/**
 * Only the parts of a stage scorecard a comparison reads: the blockers that
 * fired, the dimension grades and the output they judged. Loose, so a
 * scorecard carrying fields a later card adds still reads.
 */
export const stageGradingRecordSchema = z.looseObject({
	stage: z.string().min(1),
	input: z.looseObject({
		artifact: z.looseObject({ content: z.string() }).optional(),
		diff: z.string().optional(),
	}),
	grade: z.looseObject({
		hardBlockers: z.array(
			z.looseObject({
				id: z.string().min(1),
				status: z.enum(["PASS", "FAIL"]),
			}),
		),
		dimensions: z.array(
			z.looseObject({ id: z.string().min(1), grade: stageLetterGradeSchema }),
		),
	}),
});

export type StageGradingRecord = Immutable<
	z.infer<typeof stageGradingRecordSchema>
>;

export interface StageGrading {
	readonly stage: string;
	readonly hardBlockers: readonly {
		readonly id: string;
		readonly fired: boolean;
	}[];
	readonly dimensions: readonly {
		readonly id: string;
		readonly grade: z.infer<typeof stageLetterGradeSchema>;
	}[];
	readonly words: OutputWords;
}

/** A hard blocker's FAIL means its condition occurred, so it fired. */
export function stageGrading(record: StageGradingRecord): StageGrading {
	return {
		stage: record.stage,
		hardBlockers: record.grade.hardBlockers.map(({ id, status }) => ({
			id,
			fired: status === "FAIL",
		})),
		dimensions: record.grade.dimensions.map(({ id, grade }) => ({
			id,
			grade,
		})),
		words: stageOutputWords(record.input),
	};
}
