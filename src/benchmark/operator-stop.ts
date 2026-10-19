import { z } from "zod";

import type { BenchmarkRunPaths, ConfirmationGroupPaths } from "./run-layout";
import { OPERATOR_STOPPED } from "./stopped-status";
import orderedValidationIssues from "./validation-issue-order";

const RECORD_JSON_INDENT_SPACES = 2;

const operatorStopRecordSchema = z.object({
	signal: z.string().nonempty(),
	status: z.literal(OPERATOR_STOPPED),
});

/** The record a signal's stop leaves, for a run or a confirmation group. */
function operatorStopRecord(signal: NodeJS.Signals): string {
	const record = Object.fromEntries([
		["status", OPERATOR_STOPPED],
		["signal", signal],
	]);
	return `${JSON.stringify(record, null, RECORD_JSON_INDENT_SPACES)}\n`;
}

/**
 * Whether a signal ended the run or group, which `run-abort.ts` and the
 * group executors record on disk.
 */
async function operatorStopped(
	paths: Readonly<Pick<BenchmarkRunPaths, "operatorStopFile">>,
): Promise<boolean> {
	const file = Bun.file(paths.operatorStopFile);
	if (!(await file.exists())) {
		return false;
	}

	const parsed = operatorStopRecordSchema.safeParse(
		JSON.parse(await file.text()),
	);
	if (!parsed.success) {
		const issues = orderedValidationIssues({
			error: parsed.error,
			order: { fields: ["status", "signal"] },
		});
		throw new z.ZodError([...issues]);
	}

	return true;
}

/**
 * Whether a group ended by a signal before writing its group record. Such a
 * group writes none by design, so readers leave it out rather than report it
 * unreadable.
 */
async function stoppedBeforeGroupRecord(
	paths: Readonly<
		Pick<ConfirmationGroupPaths, "groupFile" | "operatorStopFile">
	>,
): Promise<boolean> {
	return (
		!(await Bun.file(paths.groupFile).exists()) &&
		(await operatorStopped(paths))
	);
}

export { operatorStopRecord, operatorStopped, stoppedBeforeGroupRecord };
