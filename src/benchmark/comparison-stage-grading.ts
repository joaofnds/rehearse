import { z } from "zod";

import type { Immutable } from "./contracts";
import { stageLetterGradeSchema } from "./contracts";
import judgeContractSha256Schema from "./judge-contract-schema";
import type { OutputWords } from "./output-words";
import { recordedFinalReplySchema, stageOutputWords } from "./output-words";

const REQUIRED_TEXT_MINIMUM_CODE_UNITS = 1;

const recordedArtifactSchema = z
	.looseObject({ content: z.string() })
	.optional();

const recordedBlockerSchema = z.looseObject({
	id: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
	status: z.enum(["PASS", "FAIL"]),
});

const recordedDimensionSchema = z.looseObject({
	grade: stageLetterGradeSchema,
	id: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
});

/**
 * Only the parts of a stage scorecard a comparison reads: the blockers that
 * fired, the dimension grades and the output they judged. Loose, so a
 * scorecard carrying fields a later card adds still reads.
 */
const stageGradingRecordSchema = z.looseObject({
	grade: z.looseObject({
		dimensions: z.array(recordedDimensionSchema),
		hardBlockers: z.array(recordedBlockerSchema),
	}),
	input: z.looseObject({
		artifact: recordedArtifactSchema,
		transcript: recordedFinalReplySchema.optional(),
	}),
	judgeContractSha256: judgeContractSha256Schema.optional(),
	stage: z.string().nonempty(),
});

type StageGradingRecord = Immutable<z.infer<typeof stageGradingRecordSchema>>;

interface StageGrading {
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
function stageGrading(record: StageGradingRecord): StageGrading {
	return {
		dimensions: record.grade.dimensions.map(({ id, grade }) => ({
			grade,
			id,
		})),
		hardBlockers: record.grade.hardBlockers.map(({ id, status }) => ({
			fired: status === "FAIL",
			id,
		})),
		stage: record.stage,
		words: stageOutputWords(record.input),
	};
}

export { stageGrading, stageGradingRecordSchema };
export type { StageGrading, StageGradingRecord };
