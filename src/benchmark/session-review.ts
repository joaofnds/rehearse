import { z } from "zod";

import type { Immutable } from "./contracts";
import judgeContractSha256Schema from "./judge-contract-schema";
import type { SessionJudgeRecord } from "./session-judge-contract";

const SCHEMA_VERSION = 1;
const EMPTY_COUNT = 0;

const sessionReviewFields = {
	requirements: z
		.array(
			z.strictObject({
				id: z.string().nonempty(),
				status: z.enum(["PASS", "FAIL"]),
			}),
		)
		.readonly(),
	sourceSha256: judgeContractSha256Schema,
	summary: z.string().trim().nonempty(),
	verdict: z.enum(["PASS", "FAIL"]),
};
const sessionReviewSchema = z.strictObject(sessionReviewFields);
const sessionReviewRecordSchema = z.strictObject({
	...sessionReviewFields,
	judge: z
		.strictObject({
			judgeContractSha256: judgeContractSha256Schema.optional(),
			model: z.string().nonempty(),
			rubricSha256: judgeContractSha256Schema,
		})
		.optional(),
	recordedAt: z.iso.datetime(),
	schemaVersion: z.literal(SCHEMA_VERSION),
	sourceId: z.string().nonempty(),
});

type SessionReview = Immutable<z.infer<typeof sessionReviewSchema>>;
type SessionReviewRecord = Immutable<z.infer<typeof sessionReviewRecordSchema>>;

class InvalidSessionReviewError extends Error {
	public override name = "InvalidSessionReviewError";
}

function validateReviewRequirements(
	review: SessionReview,
	requirements: readonly string[],
): void {
	const ids = review.requirements.map(({ id }) => id);
	if (
		ids.length !== requirements.length ||
		new Set(ids).size !== ids.length ||
		!requirements.every((id) => ids.includes(id))
	) {
		throw new InvalidSessionReviewError(
			"Grade every saved rubric requirement exactly once",
		);
	}
	if (
		ids.length > EMPTY_COUNT &&
		review.verdict !==
			(review.requirements.every(({ status }) => status === "PASS")
				? "PASS"
				: "FAIL")
	) {
		throw new InvalidSessionReviewError(
			"The verdict must match the requirement grades",
		);
	}
}

interface ReviewAgreement {
	readonly verdict: boolean;
	readonly differences: readonly {
		readonly id: string;
		readonly judge: "PASS" | "FAIL";
		readonly human: "PASS" | "FAIL" | undefined;
	}[];
}

function reviewAgreement(
	review: SessionReviewRecord | undefined,
	judge: Immutable<SessionJudgeRecord> | undefined,
): ReviewAgreement | undefined {
	if (review === undefined || judge?.status !== "GRADED") {
		return undefined;
	}

	return {
		differences: judge.grade.requirements.flatMap((requirement) => {
			const human = review.requirements.find(({ id }) => id === requirement.id);
			return human?.status === requirement.status
				? []
				: [
						{
							human: human?.status,
							id: requirement.id,
							judge: requirement.status,
						},
					];
		}),
		verdict: review.verdict === judge.grade.verdict,
	};
}

function reviewJudgeIdentity(
	judge: Immutable<SessionJudgeRecord> | undefined,
): SessionReviewRecord["judge"] {
	if (judge === undefined) {
		return undefined;
	}
	return {
		judgeContractSha256: judge.judgeContractSha256,
		model: judge.model,
		rubricSha256: judge.definition.rubricSha256,
	};
}

export {
	InvalidSessionReviewError,
	sessionReviewSchema,
	sessionReviewRecordSchema,
	validateReviewRequirements,
	reviewAgreement,
	reviewJudgeIdentity,
};
export type { SessionReview, SessionReviewRecord };
