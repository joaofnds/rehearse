import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { Immutable } from "#benchmark/contracts";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import { parseSessionAttemptRecord } from "#benchmark/session-record";

interface SessionAttemptRecordLocation {
	readonly runsDirectory: string;
	readonly caseId: string;
}
async function readAttemptRecord(
	recordFile: string,
): Promise<Immutable<SessionAttemptRecord>> {
	const record = parseSessionAttemptRecord(await Bun.file(recordFile).text());
	return record;
}
async function firstAttemptRecord({
	runsDirectory,
	caseId,
}: SessionAttemptRecordLocation): Promise<Immutable<SessionAttemptRecord>> {
	const [attemptId] = await readdir(join(runsDirectory, "sessions", caseId));
	return await readAttemptRecord(
		join(runsDirectory, "sessions", caseId, attemptId ?? "", "attempt.json"),
	);
}
export { firstAttemptRecord, readAttemptRecord };
