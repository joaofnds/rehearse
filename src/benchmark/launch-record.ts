import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { z } from "zod";
import { LAUNCH_ATTEMPTS } from "./launch-attempts";
import { launchPaths } from "./run-layout";

export const launchAttemptsSchema = z.union(
	LAUNCH_ATTEMPTS.map((count) => z.literal(count)),
);

const launchCommon = {
	id: z.uuid(),
	pid: z.number().int().positive(),
	/**
	 * When the process holding `pid` started, as the process table reports
	 * it, so a stop can tell the launch's process from a later one given the
	 * same pid. A record written before it was kept has none.
	 */
	startedAt: z.string().optional(),
	launchedAt: z.iso.datetime(),
	/** When the operator asked the launch to stop, recorded before the signal. */
	stopRequestedAt: z.iso.datetime().optional(),
};

const caseTarget = {
	kind: z.literal("case"),
	caseId: z.string(),
	attempts: launchAttemptsSchema,
};

const replayTarget = {
	kind: z.literal("replay"),
	run: z.string(),
	stage: z.string(),
	attempts: launchAttemptsSchema,
};

/**
 * Its attempts are the baseline group's reps, which copy arm A's, so they are
 * any group size a terminal could have recorded rather than one the dialog offers.
 */
const comparisonTarget = {
	kind: z.literal("comparison"),
	armA: z.string(),
	armB: z.string(),
	run: z.string(),
	stage: z.string(),
	attempts: z.number().int().min(2),
};

/**
 * Its attempts are the ones added to each arm, and its cost the one the
 * browser stated and the operator approved before it started.
 */
const extensionTarget = {
	kind: z.literal("extension"),
	comparison: z.string(),
	run: z.string(),
	stage: z.string(),
	attempts: z.number().int().positive(),
	usd: z.number().nonnegative(),
};

const launchTargetSchema = z.discriminatedUnion("kind", [
	z.object(caseTarget).strict(),
	z.object(replayTarget).strict(),
	z.object(comparisonTarget).strict(),
	z.object(extensionTarget).strict(),
]);

/** What a launch runs, apart from the process that runs it. */
export type LaunchTarget = z.infer<typeof launchTargetSchema>;

const launchRecordSchema = z.discriminatedUnion("kind", [
	z.object({ ...launchCommon, ...caseTarget }).strict(),
	z.object({ ...launchCommon, ...replayTarget }).strict(),
	z.object({ ...launchCommon, ...comparisonTarget }).strict(),
	z.object({ ...launchCommon, ...extensionTarget }).strict(),
]);

export type LaunchRecord = z.infer<typeof launchRecordSchema>;

/**
 * Written beside the file and renamed over it, so a reader listing launches
 * while one is being recorded sees the whole record or none of it.
 */
export async function writeLaunchRecord(
	runsDirectory: string,
	record: Readonly<LaunchRecord>,
): Promise<void> {
	const { directory, recordFile } = launchPaths(runsDirectory, record.id);
	const temporary = `${recordFile}.${randomUUID()}.tmp`;
	await mkdir(directory, { recursive: true });
	await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`);
	await rename(temporary, recordFile);
}

export function isLaunchId(value: string): boolean {
	return launchCommon.id.safeParse(value).success;
}

export async function readLaunchRecord(
	runsDirectory: string,
	id: string,
): Promise<LaunchRecord> {
	const { recordFile } = launchPaths(runsDirectory, id);

	return launchRecordSchema.parse(await Bun.file(recordFile).json());
}
