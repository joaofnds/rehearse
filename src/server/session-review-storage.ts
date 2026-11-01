import { link, rm, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";

import { z } from "zod";

import { sessionReviewRecordSchema } from "#benchmark/session-review";
import type { SessionReviewRecord } from "#benchmark/session-review";
import { CalibrationRefusalError } from "#server/calibration-contract";
import { HTTP_STATUS_CONFLICT } from "#server/http-status";
import { readVerifiedFile, verifiedFile } from "#server/session-history-reader";
import type { ReviewSource } from "#server/session-review-source";

const JSON_INDENT_SPACES = 2;

async function readReview(
	source: ReviewSource,
): Promise<SessionReviewRecord | undefined> {
	const file = await verifiedFile(source.root, {
		directory: dirname(source.file),
		name: basename(source.file),
		required: false,
	});
	if (file === undefined) {
		return undefined;
	}

	const review = sessionReviewRecordSchema.parse(
		JSON.parse(await readVerifiedFile(source.root, file)),
	);
	if (review.sourceId !== source.id) {
		throw new CalibrationRefusalError(
			HTTP_STATUS_CONFLICT,
			"The review names a different saved attempt",
		);
	}

	return review;
}

async function writeReview(
	file: string,
	record: SessionReviewRecord,
): Promise<void> {
	const temporary = `${file}.${crypto.randomUUID()}.partial`;
	await writeFile(
		temporary,
		`${JSON.stringify(record, null, JSON_INDENT_SPACES)}\n`,
		{ flag: "wx" },
	);
	try {
		await link(temporary, file);
	} catch (error) {
		const parsed = z.object({ code: z.literal("EEXIST") }).safeParse(error);
		if (parsed.success) {
			throw new CalibrationRefusalError(
				HTTP_STATUS_CONFLICT,
				"This attempt already has a human review",
			);
		}

		throw error;
	} finally {
		await rm(temporary, { force: true });
	}
}

export { readReview, writeReview };
