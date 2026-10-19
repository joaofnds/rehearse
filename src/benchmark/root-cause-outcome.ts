import { z } from "zod";

import { operatorStopped } from "./operator-stop";
import {
	finalRecordFieldOrder,
	finalRecordSchema,
} from "./root-cause-bundle-contract";
import type { BundleOutcome } from "./root-cause-bundle-contract";
import { benchmarkRunPaths } from "./run-layout";
import { stoppedStage } from "./run-outcome";
import { OPERATOR_STOPPED } from "./stopped-status";
import orderedValidationIssues from "./validation-issue-order";

async function finalOutcome(
	finalFile: ReturnType<typeof Bun.file>,
): Promise<BundleOutcome> {
	const parsed = finalRecordSchema.safeParse(await finalFile.json());
	if (!parsed.success) {
		const issues = orderedValidationIssues({
			error: parsed.error,
			order: finalRecordFieldOrder,
		});
		throw new z.ZodError([...issues]);
	}

	const final = parsed.data;
	if (final.grade === undefined || final.grade === null) {
		return { status: final.status };
	}

	return {
		status: final.status,
		summary: final.grade.summary,
		verdict: final.grade.verdict,
	};
}

async function runOutcome(
	runsDirectory: string,
	run: string,
): Promise<BundleOutcome> {
	return (
		(await recordedOutcome(runsDirectory, run)) ?? {
			status: "NO_OUTCOME_RECORDED",
		}
	);
}

/**
 * The outcome a run's records hold: its final record, a stage stop or an
 * operator stop. A run with none of them has not ended, or died first.
 */
async function recordedOutcome(
	runsDirectory: string,
	run: string,
): Promise<BundleOutcome | undefined> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	const finalFile = Bun.file(paths.artifactFile);
	if (await finalFile.exists()) {
		return await finalOutcome(finalFile);
	}

	const stopped = await stoppedStage(runsDirectory, run);
	if (stopped !== undefined) {
		return {
			error: stopped.error,
			stage: stopped.stage,
			status: "STAGE_JUDGE_FAILED",
		};
	}

	if (await operatorStopped(paths)) {
		return { status: OPERATOR_STOPPED };
	}

	return undefined;
}

export { runOutcome, recordedOutcome };
