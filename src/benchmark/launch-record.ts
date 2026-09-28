import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { z } from "zod";
import { launchIds, launchPaths } from "./run-layout";

/** The attempt counts the launch dialog offers, and no other. */
export const LAUNCH_ATTEMPTS = [1, 3, 6, 12] as const;

export const launchAttemptsSchema = z.union(
	LAUNCH_ATTEMPTS.map((count) => z.literal(count)),
);

const launchCommon = {
	id: z.uuid(),
	attempts: launchAttemptsSchema,
	pid: z.number().int().positive(),
	launchedAt: z.iso.datetime(),
};

const launchRecordSchema = z.discriminatedUnion("kind", [
	z
		.object({ ...launchCommon, kind: z.literal("case"), caseId: z.string() })
		.strict(),
	z
		.object({
			...launchCommon,
			kind: z.literal("replay"),
			run: z.string(),
			stage: z.string(),
		})
		.strict(),
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

export async function readLaunchRecord(
	runsDirectory: string,
	id: string,
): Promise<LaunchRecord> {
	const { recordFile } = launchPaths(runsDirectory, id);

	return launchRecordSchema.parse(await Bun.file(recordFile).json());
}

export async function readLaunchRecords(
	runsDirectory: string,
): Promise<readonly LaunchRecord[]> {
	const ids = await launchIds(runsDirectory);

	return Promise.all(ids.map((id) => readLaunchRecord(runsDirectory, id)));
}
