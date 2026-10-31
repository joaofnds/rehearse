import AttemptStoppedError from "#benchmark/attempt-stopped-error";
import type { Immutable } from "#benchmark/contracts";
import type { SessionAttemptPaths } from "#benchmark/run-layout";
import type { AttemptsInFlight } from "#benchmark/session-attempt";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";

interface StoppedAttemptCheck {
	readonly paths: SessionAttemptPaths;
	readonly inFlight: AttemptsInFlight;
}

interface AttemptRecordWrite extends StoppedAttemptCheck {
	readonly record: Immutable<SessionAttemptRecord>;
}

/**
 * Once an operator stop has closed the command, which records the stop in
 * the attempt's directory, no record is written, so the attempt keeps only
 * what it preserved, as a stopped group's reps do, and neither a kill nor a
 * refused command the stop caused is recorded as the attempt's outcome.
 */
function refuseWhenStopped({ paths, inFlight }: StoppedAttemptCheck): void {
	if (inFlight.stoppedBy() !== undefined) {
		throw new AttemptStoppedError(paths.directory);
	}
}

async function writeAttemptRecord({
	paths,
	record,
	inFlight,
}: AttemptRecordWrite): Promise<void> {
	refuseWhenStopped({ inFlight, paths });
	await Bun.write(
		paths.recordFile,
		`${JSON.stringify(record, null, RECORD_JSON_INDENT_SPACES)}\n`,
	);
}

export { writeAttemptRecord as default, refuseWhenStopped };
