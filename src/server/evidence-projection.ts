import { z } from "zod";

import {
	judgeGradeSchema,
	stageGradeSchema,
	stageJudgeInputSchema,
	stageScorecardSchema,
} from "#benchmark/contracts";
import type { Immutable, RecordedStageEvidence } from "#benchmark/contracts";
import { locatorReading } from "#benchmark/record-summary";
import type { StageLetterGrade } from "#benchmark/stage-letter-grades";

const NO_EVIDENCE_ITEMS = 0;

interface EvidenceCitation {
	readonly source: string;
	readonly path: string;
	readonly claim: string;
	readonly quote?: string | undefined;
	readonly place?: string | undefined;
}
interface AssessedCriterion {
	readonly id: string;
	readonly status: "PASS" | "FAIL";
	readonly evidence: readonly EvidenceCitation[];
}
type SavedStageOutput =
	| {
			readonly state: "available";
			readonly kind: "artifact" | "reply" | "diff";
			readonly path?: string | undefined;
			readonly text: string;
	  }
	| { readonly state: "unavailable"; readonly reason: string };
type FinalAssessment =
	| { readonly state: "unavailable"; readonly reason: string }
	| {
			readonly state: "available";
			readonly summary?: string | undefined;
			readonly requirements: readonly AssessedCriterion[];
	  };
interface StepAssessment {
	readonly grade: StageLetterGrade;
	readonly verdict: "CONTINUE" | "STOP";
	readonly summary?: string | undefined;
	readonly detailed: boolean;
	readonly hardBlockers: readonly AssessedCriterion[];
	readonly requirements: readonly AssessedCriterion[];
	readonly dimensions: readonly {
		readonly id: string;
		readonly grade: StageLetterGrade;
		readonly evidence: readonly EvidenceCitation[];
	}[];
}
const savedInputSchema = stageJudgeInputSchema
	.pick({ artifact: true, diff: true, transcript: true })
	.partial();
const savedOutputRecordSchema = z.object({
	input: savedInputSchema.optional(),
});
interface SavedStepOutput {
	readonly output: SavedStageOutput;
	readonly diff?: string | undefined;
	readonly completionReply?: string | undefined;
}
function selectSavedOutput(
	input: Immutable<z.infer<typeof savedInputSchema>> | undefined,
	reply: string | undefined,
): SavedStageOutput {
	if (input?.artifact !== undefined) {
		return {
			kind: "artifact",
			path: input.artifact.path,
			state: "available",
			text: input.artifact.content,
		};
	}
	if (reply !== undefined) {
		return { kind: "reply", state: "available", text: reply };
	}
	if (input?.diff !== undefined) {
		return { kind: "diff", state: "available", text: input.diff };
	}

	return {
		reason:
			"This record retains no output artifact, completed agent reply or delivery diff.",
		state: "unavailable",
	};
}
function projectSavedStepOutput(
	record: Immutable<z.infer<typeof savedOutputRecordSchema>>,
): SavedStepOutput {
	const { input } = record;
	const reply = input?.transcript?.exchanges.findLast(
		({ agent }) => agent.status === "COMPLETE",
	)?.agent.message;
	const output = selectSavedOutput(input, reply);

	return {
		output,
		...(input?.diff !== undefined &&
			(output.state !== "available" || output.text !== input.diff) && {
				diff: input.diff,
			}),
		...(reply !== undefined &&
			(output.state !== "available" || output.text !== reply) && {
				completionReply: reply,
			}),
	};
}
function projectCitation(
	cited: Immutable<RecordedStageEvidence>,
): EvidenceCitation {
	const { source, path, claim, quote, locator } = cited;

	return {
		claim,
		path,
		source,
		...(quote !== undefined && { quote }),
		...(locator !== undefined && { place: locatorReading(locator) }),
	};
}
function projectCitations(
	evidence: readonly Immutable<RecordedStageEvidence>[],
): readonly EvidenceCitation[] {
	return evidence.map((item) => projectCitation(item));
}
type CriterionRecord = Immutable<
	z.infer<typeof stageGradeSchema>["requirements"][number]
>;
function projectCriteria(
	criteria: readonly CriterionRecord[],
): readonly AssessedCriterion[] {
	return criteria.map(({ id, status, evidence }) => ({
		evidence: projectCitations(evidence),
		id,
		status,
	}));
}
const finalAssessmentRecordSchema = z.object({
	grade: judgeGradeSchema.partial().required({ requirements: true }),
});
function projectFinalAssessment(
	record: Immutable<z.infer<typeof finalAssessmentRecordSchema>>,
	expectedVerdict?: "PASS" | "FAIL",
): FinalAssessment {
	if (
		expectedVerdict !== undefined &&
		record.grade.verdict !== expectedVerdict
	) {
		return {
			reason:
				"This record retains no readable final criteria or citations matching its recorded outcome.",
			state: "unavailable",
		};
	}

	return {
		state: "available",
		...(record.grade.summary !== undefined && {
			summary: record.grade.summary,
		}),
		requirements: projectCriteria(record.grade.requirements),
	};
}
const summarySchema = stageScorecardSchema.pick({ stage: true }).extend({
	grade: stageGradeSchema
		.pick({ grade: true, summary: true, verdict: true })
		.partial({ summary: true }),
});
const detailedSchema = stageGradeSchema
	.partial()
	.required({ grade: true, verdict: true });
function projectStepAssessment(
	record: Immutable<z.infer<typeof summarySchema>>,
	details: Immutable<z.infer<typeof detailedSchema>> | undefined,
): StepAssessment {
	const hardBlockers = details?.hardBlockers ?? [];
	const requirements = details?.requirements ?? [];
	const dimensions = details?.dimensions ?? [];

	return {
		detailed:
			hardBlockers.length + requirements.length + dimensions.length >
			NO_EVIDENCE_ITEMS,
		dimensions: dimensions.map(({ id, grade, evidence }) => ({
			evidence: projectCitations(evidence),
			grade,
			id,
		})),
		grade: record.grade.grade,
		hardBlockers: projectCriteria(hardBlockers),
		requirements: projectCriteria(requirements),
		summary: record.grade.summary,
		verdict: record.grade.verdict,
	};
}
/** Validate the retained fields once, then project typed values without re-reading JSON. */
const scorecardEvidenceSchema = summarySchema.transform((record) => {
	const output = savedOutputRecordSchema.safeParse(record);
	const details = detailedSchema.safeParse(record.grade);
	const saved: SavedStepOutput = output.success
		? projectSavedStepOutput(output.data)
		: {
				output: {
					reason: "The saved step record does not retain readable output.",
					state: "unavailable",
				},
			};

	return {
		stage: record.stage,
		...saved,
		assessment: projectStepAssessment(
			record,
			details.success ? details.data : undefined,
		),
	};
});

export {
	savedOutputRecordSchema,
	projectSavedStepOutput,
	finalAssessmentRecordSchema,
	projectFinalAssessment,
	scorecardEvidenceSchema,
};
export type {
	EvidenceCitation,
	AssessedCriterion,
	SavedStageOutput,
	FinalAssessment,
	StepAssessment,
	SavedStepOutput,
};
