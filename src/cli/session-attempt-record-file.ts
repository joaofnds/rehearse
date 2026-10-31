import AttemptStoppedError from "#benchmark/attempt-stopped-error";
import type { Immutable } from "#benchmark/contracts";
import { operatorStopRecord } from "#benchmark/operator-stop";
import type { SessionAttemptPaths } from "#benchmark/run-layout";
import type { AttemptsInFlight } from "#benchmark/session-attempt";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";

interface AttemptStopWrite {
	readonly paths: SessionAttemptPaths;
	readonly inFlight: AttemptsInFlight;
}

interface AttemptRecordWrite extends AttemptStopWrite {
	readonly record: Immutable<SessionAttemptRecord>;
}

/**
 * Once an operator stop has closed the command, the stop is written in place
 * of the record, so the attempt keeps only what it preserved, as a stopped
 * group's reps do, and neither a kill nor a refused command the stop caused
 * is recorded as the attempt's outcome.
 */
async function writeStopWhenStopped({
	paths,
	inFlight,
}: AttemptStopWrite): Promise<void> {
	const signal = inFlight.stoppedBy();
	if (signal !== undefined) {
		await Bun.write(paths.operatorStopFile, operatorStopRecord(signal));
		throw new AttemptStoppedError(paths.directory);
	}
}

async function writeAttemptRecord({
	paths,
	record,
	inFlight,
}: AttemptRecordWrite): Promise<void> {
	await writeStopWhenStopped({ inFlight, paths });
	await Bun.write(
		paths.recordFile,
		`${JSON.stringify(record, null, RECORD_JSON_INDENT_SPACES)}\n`,
	);
}

export { writeAttemptRecord as default, writeStopWhenStopped };
