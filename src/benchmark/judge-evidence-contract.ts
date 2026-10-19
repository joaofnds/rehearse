import { z } from "zod";

import type { Immutable } from "./contracts";
import { stageLetterGradeSchema } from "./stage-rubric-contract";

const evidenceSchema = z.object({
	claim: z.string().nonempty(),
	path: z.string().nonempty(),
	source: z.enum(["diff", "baseline-context", "local-checks"]),
});

const stageEvidenceSourceSchema = z.enum([
	"task",
	"product-brief",
	"instructions",
	"task-state",
	"transcript",
	"artifact",
	"prior-artifact",
	"baseline-context",
	"diff",
	"commit-subjects",
	"check-integrity",
	"local-checks",
	"harness-failure",
]);

const lineCountSchema = z.number().int().positive();

const indexSchema = z.number().int().nonnegative();

const evidenceLocatorSchema = z.discriminatedUnion("kind", [
	z.object({
		endLine: lineCountSchema,
		file: z.string().nonempty(),
		kind: z.literal("lines"),
		occurrences: lineCountSchema,
		startLine: lineCountSchema,
	}),
	z.object({
		file: z.string().nonempty(),
		hunk: z.string().nonempty(),
		kind: z.literal("hunk"),
		occurrences: lineCountSchema,
	}),
	z.object({ index: indexSchema, kind: z.literal("commit-subject") }),
	z.object({
		end: indexSchema,
		exchange: indexSchema,
		field: z.enum(["message", "productOwnerAnswer"]),
		kind: z.literal("exchange"),
		start: indexSchema,
	}),
	z.object({
		kind: z.literal("harness"),
		recorded: z.boolean(),
		result: z.enum(["checkIntegrity", "localChecks", "harnessFailure"]),
	}),
	z.object({ kind: z.literal("absent") }),
]);

const recordedStageEvidenceSchema = z.object({
	claim: z.string().nonempty(),
	locator: evidenceLocatorSchema.optional(),
	path: z.string().nonempty(),
	quote: z.string().nonempty().optional(),
	source: stageEvidenceSourceSchema,
});

const judgeStageEvidenceSchema = z.object({
	claim: z.string().nonempty(),
	path: z.string().nonempty(),
	quote: z
		.string()
		.describe(
			"Text copied character for character from the cited source's supplied text that supports the claim; empty for check-integrity, local-checks and harness-failure",
		),
	source: stageEvidenceSourceSchema,
});

const passFailFields = {
	id: z.string().nonempty(),
	status: z.enum(["PASS", "FAIL"]),
};

const gradedHardBlockersSchema = z.array(z.object(passFailFields).loose());

type GradedHardBlockers = Immutable<z.infer<typeof gradedHardBlockersSchema>>;

const dimensionFields = {
	grade: stageLetterGradeSchema,
	id: z.string().nonempty(),
};

const judgeEvidenceListSchema = z.array(judgeStageEvidenceSchema).nonempty();

const recordedEvidenceListSchema = z
	.array(recordedStageEvidenceSchema)
	.nonempty();

const judgeEvidenceSchema = evidenceSchema.extend({
	quote: z
		.string()
		.describe(
			"Text copied character for character from the cited diff or baseline context file that supports the claim; empty for local-checks",
		),
});

const recordedEvidenceSchema = evidenceSchema.extend({
	locator: evidenceLocatorSchema.optional(),
	quote: z.string().nonempty().optional(),
});

type EvidenceLocator = Immutable<z.infer<typeof evidenceLocatorSchema>>;

type RecordedStageEvidence = Immutable<
	z.infer<typeof recordedStageEvidenceSchema>
>;

export {
	evidenceSchema,
	evidenceLocatorSchema,
	recordedStageEvidenceSchema,
	judgeStageEvidenceSchema,
	passFailFields,
	gradedHardBlockersSchema,
	dimensionFields,
	judgeEvidenceListSchema,
	recordedEvidenceListSchema,
	judgeEvidenceSchema,
	recordedEvidenceSchema,
};
export type { GradedHardBlockers, EvidenceLocator, RecordedStageEvidence };
