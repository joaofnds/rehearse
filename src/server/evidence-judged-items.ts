import { z } from "zod";

import {
	contextFileSchema,
	localCheckResultSchema,
	stageJudgeInputSchema,
} from "#benchmark/contracts";
import type { Immutable } from "#benchmark/contracts";
import { stageTextFiles } from "#benchmark/stage-judge-evidence";
import RecordedSources from "#server/evidence-recorded-sources";
import { judgedItemSchema } from "#server/evidence-source-contract";
import type { JudgedItems } from "#server/evidence-source-contract";

const stageSectionsSchema = z.looseObject({
	dimensions: z.array(judgedItemSchema),
	hardBlockers: z.array(judgedItemSchema),
	requirements: z.array(judgedItemSchema),
});

/** The record of the stage that stopped the run keeps its judged items beside its status. */
const stageRecordSchema = z.union([
	z.looseObject({ grade: stageSectionsSchema, input: stageJudgeInputSchema }),
	stageSectionsSchema
		.extend({
			input: stageJudgeInputSchema,
			status: z.literal("STAGE_JUDGE_FAILED"),
		})
		.transform(({ input, ...grade }) => ({ grade, input })),
]);

const finalRecordSchema = z.looseObject({
	baselineContext: z.array(contextFileSchema),
	checkIntegrity: localCheckResultSchema,
	diff: z.string(),
	grade: z.looseObject({ requirements: z.array(judgedItemSchema) }),
	localChecks: localCheckResultSchema,
});

function stageItems(text: string): JudgedItems | undefined {
	const parsed = stageRecordSchema.safeParse(JSON.parse(text));
	if (!parsed.success) {
		return undefined;
	}

	const { grade, input } = parsed.data;

	return {
		sections: {
			dimensions: grade.dimensions,
			hardBlockers: grade.hardBlockers,
			requirements: grade.requirements,
		},
		sources: new RecordedSources({
			commitSubjects: input.commitSubjects,
			diff: input.diff,
			exchanges: input.transcript.exchanges,
			harness: {
				...(input.checkIntegrity && { checkIntegrity: input.checkIntegrity }),
				...(input.localChecks && { localChecks: input.localChecks }),
				...(input.harnessFailure !== undefined && {
					harnessFailure: input.harnessFailure,
				}),
			},
			texts: (source) => stageTextFiles(source, input),
		}),
	};
}

function finalItems(text: string): JudgedItems | undefined {
	const parsed = finalRecordSchema.safeParse(JSON.parse(text));
	if (!parsed.success) {
		return undefined;
	}

	const record = parsed.data;

	return {
		sections: { requirements: record.grade.requirements },
		sources: new RecordedSources({
			commitSubjects: undefined,
			diff: record.diff,
			exchanges: [],
			harness: {
				checkIntegrity: record.checkIntegrity,
				localChecks: record.localChecks,
			},
			texts: (source) =>
				source === "baseline-context"
					? record.baselineContext.map(({ path, content }) => ({
							file: path,
							text: content,
						}))
					: [],
		}),
	};
}

/** Accepted recorded shapes for producers of stored evidence records. */
type StageEvidenceRecord = Extract<
	Immutable<z.input<typeof stageRecordSchema>>,
	{ readonly grade: unknown }
>;
type FinalEvidenceRecord = Immutable<z.input<typeof finalRecordSchema>>;

export type { StageEvidenceRecord, FinalEvidenceRecord };

export { stageItems, finalItems };
