import { z } from "zod";

import LAUNCH_ATTEMPTS from "./launch-attempts";
import { launchPaths } from "./run-layout";
import writeWholeJsonFile from "./whole-json-file";

const MIN_COMPARISON_ATTEMPTS = 2;

const launchAttemptsSchema = z.union(
	LAUNCH_ATTEMPTS.map((count) => z.literal(count)),
);

const launchCommon = {
	id: z.uuid(),
	launchedAt: z.iso.datetime(),
	pid: z.number().int().positive(),
	/**
	 * When the process holding `pid` started, as the process table reports
	 * it, so a stop can tell the launch's process from a later one given the
	 * same pid. A record written before it was kept has none.
	 */
	startedAt: z.string().optional(),
	/** When the operator asked the launch to stop, recorded before the signal. */
	stopRequestedAt: z.iso.datetime().optional(),
};

const caseTarget = {
	attempts: launchAttemptsSchema,
	caseId: z.string(),
	kind: z.literal("case"),
};

const replayTarget = {
	attempts: launchAttemptsSchema,
	kind: z.literal("replay"),
	run: z.string(),
	stage: z.string(),
};

/**
 * Its attempts are the baseline group's reps, which copy arm A's, so they are
 * any group size a terminal could have recorded rather than one the dialog offers.
 */
const comparisonTarget = {
	armA: z.string(),
	armB: z.string(),
	attempts: z.number().int().min(MIN_COMPARISON_ATTEMPTS),
	kind: z.literal("comparison"),
	run: z.string(),
	stage: z.string(),
};

/**
 * Its attempts are the ones added to each arm, and its cost the one the
 * browser stated and the operator approved before it started.
 */
const extensionTarget = {
	attempts: z.number().int().positive(),
	comparison: z.string(),
	kind: z.literal("extension"),
	run: z.string(),
	stage: z.string(),
	usd: z.number().nonnegative(),
};

/** Its cost is the most the call may spend, as the operator approved it. */
const analysisTarget = {
	kind: z.literal("analysis"),
	run: z.string(),
	usd: z.number().nonnegative(),
};

const launchTargetSchema = z.discriminatedUnion("kind", [
	z.object(caseTarget).strict(),
	z.object(replayTarget).strict(),
	z.object(comparisonTarget).strict(),
	z.object(extensionTarget).strict(),
	z.object(analysisTarget).strict(),
]);

/** What a launch runs, apart from the process that runs it. */
type LaunchTarget = z.infer<typeof launchTargetSchema>;

const launchRecordSchema = z.discriminatedUnion("kind", [
	z.object({ ...launchCommon, ...caseTarget }).strict(),
	z.object({ ...launchCommon, ...replayTarget }).strict(),
	z.object({ ...launchCommon, ...comparisonTarget }).strict(),
	z.object({ ...launchCommon, ...extensionTarget }).strict(),
	z.object({ ...launchCommon, ...analysisTarget }).strict(),
]);

type LaunchRecord = z.infer<typeof launchRecordSchema>;

/**
 * Written beside the file and renamed over it, so a reader listing launches
 * while one is being recorded sees the whole record or none of it.
 */
async function writeLaunchRecord(
	runsDirectory: string,
	record: Readonly<LaunchRecord>,
): Promise<void> {
	await writeWholeJsonFile(
		launchPaths(runsDirectory, record.id).recordFile,
		record,
	);
}

function isLaunchId(value: string): boolean {
	return launchCommon.id.safeParse(value).success;
}

async function readLaunchRecord(
	runsDirectory: string,
	id: string,
): Promise<LaunchRecord> {
	const { recordFile } = launchPaths(runsDirectory, id);

	return launchRecordSchema.parse(await Bun.file(recordFile).json());
}

export {
	launchAttemptsSchema,
	writeLaunchRecord,
	isLaunchId,
	readLaunchRecord,
};
export type { LaunchTarget, LaunchRecord };
