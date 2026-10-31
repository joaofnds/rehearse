import type { Immutable } from "./contracts";
import type { SessionAttemptPaths } from "./run-layout";
import { parseSessionAttemptRecord } from "./session-record";
import type { SessionAttemptRecord } from "./session-record";

/**
 * The attempt's record, or undefined for an attempt with none that the
 * reader leaves out. Any other attempt with no record cannot be read.
 */
async function readSessionAttemptRecord(
	paths: Readonly<Pick<SessionAttemptPaths, "recordFile">>,
	leftOut: () => Promise<boolean>,
): Promise<Immutable<SessionAttemptRecord> | undefined> {
	const file = Bun.file(paths.recordFile);
	if (!(await file.exists())) {
		if (await leftOut()) {
			return undefined;
		}

		throw new Error("incomplete: no attempt.json recorded");
	}

	return parseSessionAttemptRecord(await file.text());
}

export { readSessionAttemptRecord as default };
