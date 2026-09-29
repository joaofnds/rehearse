import { z } from "zod";
import type { BenchmarkRunPaths } from "./run-layout";
import { OPERATOR_STOPPED } from "./stopped-status";

const operatorStopRecordSchema = z.object({
	status: z.literal(OPERATOR_STOPPED),
	signal: z.string().min(1),
});

/** The record a signal's stop leaves, for a run or a confirmation group. */
export function operatorStopRecord(signal: NodeJS.Signals): string {
	return `${JSON.stringify({ status: OPERATOR_STOPPED, signal }, null, 2)}\n`;
}

/**
 * Whether a signal ended the run or group, which `run-abort.ts` and the
 * group executors record on disk.
 */
export async function operatorStopped(
	paths: Readonly<Pick<BenchmarkRunPaths, "operatorStopFile">>,
): Promise<boolean> {
	const file = Bun.file(paths.operatorStopFile);
	if (!(await file.exists())) {
		return false;
	}

	operatorStopRecordSchema.parse(JSON.parse(await file.text()));

	return true;
}
