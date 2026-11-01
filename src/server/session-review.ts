import { z } from "zod";

import {
	reviewAgreement,
	reviewJudgeIdentity,
	sessionReviewRecordSchema,
	sessionReviewSchema,
	validateReviewRequirements,
} from "#benchmark/session-review";
import type {
	SessionReview,
	SessionReviewRecord,
} from "#benchmark/session-review";
import { CalibrationRefusalError } from "#server/calibration-contract";
import {
	HTTP_STATUS_BAD_REQUEST,
	HTTP_STATUS_CONFLICT,
} from "#server/http-status";
import reviewSource from "#server/session-review-source";
import type { SessionReviewRequest } from "#server/session-review-source";
import { readReview, writeReview } from "#server/session-review-storage";

interface SessionReviewReading {
	readonly agreement: ReturnType<typeof reviewAgreement>;
	readonly id: string;
	readonly judge: SessionReviewRecord["judge"];
	readonly requirements: readonly string[];
	readonly review: SessionReviewRecord | undefined;
	readonly rubric: string | undefined;
	readonly sourceSha256: string;
	readonly stale: boolean;
}

async function readSessionReview(
	request: SessionReviewRequest,
): Promise<SessionReviewReading> {
	const source = await reviewSource(request);
	const review = await readReview(source);
	const stale =
		review !== undefined && review.sourceSha256 !== source.sourceSha256;
	if (review !== undefined && !stale) {
		validateReviewRequirements(review, source.requirements);
		if (
			JSON.stringify(review.judge) !==
			JSON.stringify(reviewJudgeIdentity(source.judge))
		) {
			throw new CalibrationRefusalError(
				HTTP_STATUS_CONFLICT,
				"The review names a different Judge identity",
			);
		}
	}

	return {
		agreement: stale ? undefined : reviewAgreement(review, source.judge),
		id: source.id,
		judge: reviewJudgeIdentity(source.judge),
		requirements: source.requirements,
		review,
		rubric: source.judge?.definition.rubric,
		sourceSha256: source.sourceSha256,
		stale,
	};
}

async function recordSessionReview(
	request: SessionReviewRequest,
	review: SessionReview,
	recordedAt: string,
): Promise<SessionReviewReading> {
	const source = await reviewSource(request);
	if (source.sourceSha256 !== review.sourceSha256) {
		throw new CalibrationRefusalError(
			HTTP_STATUS_CONFLICT,
			"The saved attempt changed; reload it before reviewing",
		);
	}

	validateReviewRequirements(review, source.requirements);
	const record = sessionReviewRecordSchema.parse({
		...review,
		judge: reviewJudgeIdentity(source.judge),
		recordedAt,
		schemaVersion: 1,
		sourceId: source.id,
	});
	await writeReview(source.file, record);

	return await readSessionReview(request);
}

function sessionReviewFrom(text: string): SessionReview {
	try {
		return sessionReviewSchema.parse(JSON.parse(text));
	} catch (error) {
		if (error instanceof SyntaxError || error instanceof z.ZodError) {
			throw new CalibrationRefusalError(
				HTTP_STATUS_BAD_REQUEST,
				"Provide a review with sourceSha256, PASS/FAIL verdict, summary and requirements",
			);
		}

		throw error;
	}
}

export { readSessionReview, recordSessionReview, sessionReviewFrom };
export type { SessionReviewRequest } from "#server/session-review-source";
export type { SessionReviewReading };
