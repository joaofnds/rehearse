import { stoppedBeforeAttemptRecord } from "#benchmark/operator-stop";
import { readReplayRecord } from "#benchmark/replay";
import {
	replayAttemptIds,
	replayRecordFile,
	sessionAttemptIds,
	sessionAttemptPaths,
} from "#benchmark/run-layout";
import type { SessionAttemptId } from "#benchmark/run-layout";
import { parseSessionAttemptRecord } from "#benchmark/session-record";

import type { RecordListing } from "./record-listing";
import { collect, numbered } from "./record-listing";

/** Undefined for an attempt the operator stopped before its record. */
async function sessionAttemptFields(
	runsDirectory: string,
	attempt: SessionAttemptId,
): Promise<readonly string[] | undefined> {
	const paths = sessionAttemptPaths(runsDirectory, attempt);
	if (await stoppedBeforeAttemptRecord(paths)) {
		return undefined;
	}

	if (!(await Bun.file(paths.recordFile).exists())) {
		throw new Error("incomplete: no attempt.json recorded");
	}

	const record = parseSessionAttemptRecord(
		await Bun.file(paths.recordFile).text(),
	);

	return [record.caseId, record.outcome, record.model];
}

/**
 * Both kinds the glossary's Attempt entry names: one session of a session case,
 * and one stage replayed from a checkpoint. They are one listing because a
 * session choosing what to re-run wants every prior measurement, and the id's
 * kind is what keeps the two apart.
 */
async function listAttempts(runsDirectory: string): Promise<RecordListing> {
	const sessions = await collect(
		await sessionAttemptIds(runsDirectory),
		({ caseId, uuid }) => ({ caseId, kind: "attempt:session", uuid }),
		async (attempt) => await sessionAttemptFields(runsDirectory, attempt),
	);
	const replays = await collect(
		await replayAttemptIds(runsDirectory),
		({ lineage, timestamp }) => ({ kind: "attempt:stage", lineage, timestamp }),
		async ({ lineage, timestamp }) => {
			const record = await readReplayRecord(
				replayRecordFile(runsDirectory, lineage, timestamp),
			);

			return [
				record.stage,
				`${record.scorecard.grade.grade} ${record.scorecard.grade.verdict}`,
				record.model,
			];
		},
	);

	return await numbered(runsDirectory, {
		entries: [...sessions.entries, ...replays.entries],
		unreadable: [...sessions.unreadable, ...replays.unreadable],
	});
}

export { listAttempts as default };
