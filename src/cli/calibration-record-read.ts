import { z } from "zod";

import { calibratableArtifactSchema } from "#benchmark/calibration-record";
import {
	calibratableArtifactValidationOrder,
	humanReviewValidationOrder,
} from "#benchmark/calibration-validation-order";
import { displayPath } from "#benchmark/config";
import type { HumanReview } from "#benchmark/contracts";
import { humanReviewSchema } from "#benchmark/contracts";
import orderedValidationIssues from "#benchmark/validation-issue-order";
import { UsageError } from "#cli/command-usage";
import { RefusedPreconditionError } from "#cli/interactive-stdin";

import type { CalibratableRecord } from "./calibration-input-record";

async function readReview(reviewFile: string): Promise<HumanReview> {
	if (!(await Bun.file(reviewFile).exists())) {
		throw new RefusedPreconditionError(
			`No review for this run at ${displayPath(reviewFile)}; record one with rehearse review first`,
		);
	}

	const parsed = await readRecord(reviewFile, humanReviewSchema);
	if (!parsed.success) {
		const issues = orderedValidationIssues({
			error: parsed.error,
			order: humanReviewValidationOrder,
		});
		throw new UsageError(new z.ZodError([...issues]).message);
	}

	return parsed.data;
}

/**
 * Every record this command reads is a file someone may have hand-edited, and
 * the review file is one `--pause` invites a reviewer to edit. A bare parser
 * message names neither the file nor the command's own boundary, so a trailing
 * comma arrived as an execution failure with nothing to act on. Reading and
 * parsing are one step, so no caller holds the untyped value in between.
 */
async function readRecord<Schema extends z.ZodType>(
	file: string,
	schema: Schema,
): Promise<z.ZodSafeParseResult<z.infer<Schema>>> {
	const text = await Bun.file(file).text();
	try {
		return schema.safeParse(JSON.parse(text));
	} catch (error) {
		throw new UsageError(
			`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

interface FinalArtifactRequest {
	readonly file: string;
	readonly run: string;
}

async function loadFinalArtifact({
	file,
	run,
}: FinalArtifactRequest): Promise<CalibratableRecord> {
	const parsed = await readRecord(file, calibratableArtifactSchema);

	if (!parsed.success) {
		const issues = orderedValidationIssues({
			error: parsed.error,
			order: calibratableArtifactValidationOrder,
		});
		throw new UsageError(new z.ZodError([...issues]).message);
	}

	const record = parsed.data;

	if (record.status !== "AWAITING_HUMAN_REVIEW") {
		throw new RefusedPreconditionError(
			`Run ${run} is ${record.status}; only a run awaiting human review is calibrated`,
		);
	}

	return { file, kind: "final", record };
}

export { loadFinalArtifact, readRecord, readReview };
