import { join } from "node:path";

import { directoryNames } from "./record-directory-entries";
import { ATTEMPT_FILE, runNameFromTimestamp } from "./record-file-names";

const SESSIONS_DIRECTORY = "sessions";

const GRADES_DIRECTORY = "grades";

/**
 * Where one session attempt keeps its record, the corpus snapshot it ran
 * against, and every later grade of its evidence. The command that writes an
 * attempt and the three that read one all come through here, so the layout is
 * stated once and a change to it cannot leave a reader looking at the old
 * shape.
 *
 * A grade is filed inside the attempt it read, under the timestamp of the
 * pass that produced it, so one attempt carries as many assessments as it has
 * been regraded and none of them touches the record. A replay is filed the
 * other way round, at the runs-directory level under its lineage, because a
 * replay is reachable without naming a run and a grade is reached only by
 * naming the attempt it grades.
 */
function sessionAttemptPaths(
	runsDirectory: string,
	attempt: SessionAttemptId,
): SessionAttemptPaths {
	const directory = join(
		runsDirectory,
		SESSIONS_DIRECTORY,
		attempt.caseId,
		attempt.uuid,
	);

	const gradesDirectory = join(directory, GRADES_DIRECTORY);

	return {
		corpusDirectory: join(directory, "corpus"),
		directory,
		gradeFile: (timestamp) =>
			join(gradesDirectory, `${runNameFromTimestamp(timestamp)}.json`),
		gradesDirectory,
		recordFile: join(directory, ATTEMPT_FILE),
		transcriptFile: join(directory, "transcript.jsonl"),
	};
}

interface SessionAttemptId {
	readonly caseId: string;
	readonly uuid: string;
}

interface SessionAttemptPaths {
	readonly directory: string;
	readonly recordFile: string;
	readonly transcriptFile: string;
	readonly corpusDirectory: string;
	readonly gradesDirectory: string;
	readonly gradeFile: (timestamp: string) => string;
}

async function sessionAttemptIds(
	runsDirectory: string,
): Promise<readonly SessionAttemptId[]> {
	const sessionsDirectory = join(runsDirectory, SESSIONS_DIRECTORY);
	const attempts: SessionAttemptId[] = [];

	await Array.fromAsync(
		await directoryNames(sessionsDirectory),
		async (caseId) => {
			for (const uuid of await directoryNames(
				join(sessionsDirectory, caseId),
			)) {
				attempts.push({ caseId, uuid });
			}
		},
	);

	return attempts;
}

export { sessionAttemptPaths, sessionAttemptIds };
export type { SessionAttemptId, SessionAttemptPaths };
