import { z } from "zod";

import { parseRunSummaryRecord } from "#benchmark/record-summary";
import { benchmarkRunPaths, checkpointRecorded } from "#benchmark/run-layout";
import { stoppedStageRecordSchema } from "#benchmark/run-outcome";
import type {
	CheckpointAttempt,
	CheckpointIdentity,
	ClaimedAttempts,
} from "#server/checkpoint-attempts-contract";
import readOptionalRecord from "#server/optional-record";

const NO_CLAIMED_RUN_ORDER = -1;

/**
 * A stop record the Judge's findings are written into, because the stage was
 * graded below the pipeline's minimum rather than failing to be judged.
 */
const gradedStopSchema = stoppedStageRecordSchema.extend({
	summary: z.string(),
});

/**
 * The original run counts as an attempt at the checkpoint before a stage when
 * it recorded that stage's checkpoint or a grade for it, a stop for a grade
 * below the minimum included. A run whose judging failed at the stage recorded
 * no result there, so it does not count.
 */
async function originalRecorded(
	runsDirectory: string,
	run: string,
	stage: string,
): Promise<boolean> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	if (await checkpointRecorded(paths, stage)) {
		return true;
	}
	const artifact = await readOptionalRecord(async () =>
		parseRunSummaryRecord(await Bun.file(paths.artifactFile).text()),
	);

	if (
		artifact?.stageScorecards.some((scorecard) => scorecard.stage === stage) ===
		true
	) {
		return true;
	}
	const stopRecord = await readOptionalRecord(async () => {
		const stageRecordFile = Bun.file(paths.stageFile(stage));
		return gradedStopSchema.parse(JSON.parse(await stageRecordFile.text()));
	});

	return stopRecord !== undefined;
}

/**
 * Every attempt at the checkpoint before a stage that recorded a result, in
 * claim order: the original run's stage, when it recorded one, among the
 * replays and judged reps claimed there.
 */
async function orderedAttempts(
	runsDirectory: string,
	claimed: ClaimedAttempts,
	{ run, stage }: CheckpointIdentity,
): Promise<readonly CheckpointAttempt[]> {
	const attempts =
		claimed.byCheckpoint.get(checkpointKey(run, stage))?.attempts ?? [];
	const counted = (await originalRecorded(runsDirectory, run, stage))
		? [
				...attempts,
				{
					attempt: { kind: "original" } as const,
					claim: claimed.runClaims.get(run) ?? NO_CLAIMED_RUN_ORDER,
					ordinal: 0,
				},
			]
		: attempts;

	return counted
		.toSorted(
			(left, right) => left.claim - right.claim || left.ordinal - right.ordinal,
		)
		.map(({ attempt }) => attempt);
}

function checkpointKey(run: string, stage: string): string {
	return JSON.stringify([run, stage]);
}

export { orderedAttempts, checkpointKey };
