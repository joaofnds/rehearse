import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";

import { z } from "zod";

import {
	claudeCallMetricsSchema,
	contextFileSchema,
	judgeAttemptListSchema,
	judgeGradeSchema,
} from "./contracts";
import type { Immutable } from "./contracts";
import effortSchema from "./effort";
import { parseRubricIds } from "./judge";
import type { JudgeAttempt } from "./judge-attempt";
import judgeContractSha256Schema from "./judge-contract-schema";

const sessionJudgeFileSchema = z
	.string()
	.nonempty()
	.refine(
		(path) =>
			!isAbsolute(path) &&
			!path.includes("\\") &&
			path.split("/").every((part) => !["", ".", ".."].includes(part)),
		"Judge files must be literal paths within the final tree",
	);

const sessionJudgeDeclarationSchema = z
	.object({
		effort: effortSchema.optional(),
		files: z.array(sessionJudgeFileSchema).default([]),
		model: z.string().nonempty().optional(),
		rubric: z.string().nonempty(),
		sessionBudgetUsd: z.number().positive().optional(),
	})
	.strict();

interface SessionJudgeDefinition {
	readonly rubricPath: string;
	readonly rubric: string;
	readonly files: readonly string[];
	readonly model?: string | undefined;
	readonly effort?: z.infer<typeof effortSchema> | undefined;
	readonly sessionBudgetUsd?: number | undefined;
}

const sessionJudgeInputSchema = z
	.object({
		files: z.array(contextFileSchema),
		unavailable: z.array(z.string().nonempty()),
	})
	.strict();

type SessionJudgeInput = Immutable<z.infer<typeof sessionJudgeInputSchema>>;

const sessionJudgeRecordFields = {
	attempts: judgeAttemptListSchema.transform(
		(attempts): readonly JudgeAttempt[] => attempts,
	),
	costUsd: z.number().nonnegative(),
	definition: z
		.object({
			files: z.array(z.string().nonempty()),
			rubric: z.string().nonempty(),
			rubricPath: z.string().nonempty(),
			rubricSha256: judgeContractSha256Schema,
		})
		.strict(),
	effort: effortSchema.optional(),
	input: sessionJudgeInputSchema,
	judgeContractSha256: judgeContractSha256Schema.optional(),
	model: z.string().nonempty(),
	prompt: z.string().nonempty(),
	providerCalls: z.array(
		z.object({ metrics: claudeCallMetricsSchema.optional() }).strict(),
	),
	sessionBudgetUsd: z.number().positive(),
};

const sessionJudgeRecordSchema = z.discriminatedUnion("status", [
	z
		.object({
			...sessionJudgeRecordFields,
			grade: judgeGradeSchema,
			judgeContractSha256: judgeContractSha256Schema,
			status: z.literal("GRADED"),
		})
		.strict(),
	z
		.object({
			...sessionJudgeRecordFields,
			detail: z.string().nonempty(),
			status: z.enum(["ERROR", "UNAVAILABLE"]),
		})
		.strict(),
]);

type SessionJudgeRecord = Immutable<z.infer<typeof sessionJudgeRecordSchema>>;

function recordedJudgeDefinition(
	definition: SessionJudgeDefinition,
): SessionJudgeRecord["definition"] {
	parseRubricIds(definition.rubric);
	return {
		files: definition.files,
		rubric: definition.rubric,
		rubricPath: definition.rubricPath,
		rubricSha256: createHash("sha256").update(definition.rubric).digest("hex"),
	};
}

export {
	sessionJudgeDeclarationSchema,
	sessionJudgeFileSchema,
	sessionJudgeInputSchema,
	sessionJudgeRecordSchema,
	recordedJudgeDefinition,
};
export type { SessionJudgeDefinition, SessionJudgeInput, SessionJudgeRecord };
