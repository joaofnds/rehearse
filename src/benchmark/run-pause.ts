import { z } from "zod";
import type { BenchmarkRunPaths } from "./run-layout";

type PausePaths = Pick<BenchmarkRunPaths, "pauseRequestFile" | "pausedFile">;

const pausedRecordSchema = z.object({
	status: z.literal("PAUSED"),
	stage: z.string().min(1),
	pausedAt: z.iso.datetime(),
});

/**
 * Asks a running pipeline run to pause after the stage it is running. The run
 * reads the request at its next stage boundary, so the request lives on disk
 * beside the run rather than in the process that asked.
 */
export async function requestPause(
	paths: PausePaths,
	requestedAt: string,
): Promise<void> {
	await Bun.write(
		paths.pauseRequestFile,
		`${JSON.stringify({ requestedAt }, null, 2)}\n`,
	);
}

export function pauseRequested(paths: PausePaths): Promise<boolean> {
	return Bun.file(paths.pauseRequestFile).exists();
}

/** Records that the run ended paused after `stage`, its checkpoint written. */
export async function recordPaused(
	paths: PausePaths,
	stage: string,
	pausedAt: string,
): Promise<void> {
	await Bun.write(
		paths.pausedFile,
		`${JSON.stringify({ status: "PAUSED", stage, pausedAt }, null, 2)}\n`,
	);
}

/** The stage a paused run paused after, undefined for a run not paused. */
export async function pausedStage(
	paths: PausePaths,
): Promise<string | undefined> {
	const file = Bun.file(paths.pausedFile);
	if (!(await file.exists())) {
		return undefined;
	}

	return pausedRecordSchema.parse(JSON.parse(await file.text())).stage;
}
