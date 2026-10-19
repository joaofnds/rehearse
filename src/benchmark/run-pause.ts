import { z } from "zod";

import type { BenchmarkRunPaths } from "./run-layout";

const RECORD_JSON_INDENT_SPACES = 2;

type PausePaths = Pick<BenchmarkRunPaths, "pauseRequestFile" | "pausedFile">;

const pausedRecordSchema = z.object({
	pausedAt: z.iso.datetime(),
	stage: z.string().nonempty(),
	status: z.literal("PAUSED"),
});

/**
 * Asks a running pipeline run to pause after the stage it is running. The run
 * reads the request at its next stage boundary, so the request lives on disk
 * beside the run rather than in the process that asked.
 */
async function requestPause(
	paths: PausePaths,
	requestedAt: string,
): Promise<void> {
	await Bun.write(
		paths.pauseRequestFile,
		`${JSON.stringify({ requestedAt }, null, RECORD_JSON_INDENT_SPACES)}\n`,
	);
}

async function pauseRequested(paths: PausePaths): Promise<boolean> {
	return await Bun.file(paths.pauseRequestFile).exists();
}

/** Records that the run ended paused after `stage`, its checkpoint written. */
async function recordPaused(
	paths: PausePaths,
	stage: string,
	pausedAt: string,
): Promise<void> {
	await Bun.write(
		paths.pausedFile,
		`${JSON.stringify(
			{ pausedAt, stage, status: "PAUSED" },
			null,
			RECORD_JSON_INDENT_SPACES,
		)}\n`,
	);
}

/** The stage a paused run paused after, undefined for a run not paused. */
async function pausedStage(paths: PausePaths): Promise<string | undefined> {
	const file = Bun.file(paths.pausedFile);
	if (!(await file.exists())) {
		return undefined;
	}

	return pausedRecordSchema.parse(JSON.parse(await file.text())).stage;
}

export { requestPause, pauseRequested, recordPaused, pausedStage };
