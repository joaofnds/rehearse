import { z } from "zod";
import type { BenchmarkRunPaths } from "./run-layout";
import { OPERATOR_STOPPED } from "./stopped-status";

const operatorStopRecordSchema = z.object({
	status: z.literal(OPERATOR_STOPPED),
	signal: z.string().min(1),
});

/** Whether a signal ended the run, which `run-abort.ts` records on disk. */
export async function operatorStopped(
	paths: Pick<BenchmarkRunPaths, "operatorStopFile">,
): Promise<boolean> {
	const file = Bun.file(paths.operatorStopFile);
	if (!(await file.exists())) {
		return false;
	}

	operatorStopRecordSchema.parse(JSON.parse(await file.text()));

	return true;
}
