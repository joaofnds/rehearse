import { join } from "node:path";

import { directoryNames, entries } from "./record-directory-entries";
import { RECORD_SUFFIX, runNameFromTimestamp } from "./record-file-names";

const PREFIX_START_INDEX = 0;

/**
 * A replay record is filed under the lineage it consumed rather than under the
 * run that produced it, so it is reachable without naming a run.
 */
function replayRecordFile(
	runsDirectory: string,
	lineage: string,
	timestamp: string,
): string {
	return join(
		runsDirectory,
		"replays",
		lineage,
		`${runNameFromTimestamp(timestamp)}.json`,
	);
}

interface StageAttemptId {
	readonly lineage: string;
	readonly timestamp: string;
}

async function replayAttemptIds(
	runsDirectory: string,
): Promise<readonly StageAttemptId[]> {
	const replaysDirectory = join(runsDirectory, "replays");
	const attempts: StageAttemptId[] = [];

	await Array.fromAsync(
		await directoryNames(replaysDirectory),
		async (lineage) => {
			for (const entry of await entries(join(replaysDirectory, lineage))) {
				if (entry.isFile() && entry.name.endsWith(RECORD_SUFFIX)) {
					attempts.push({
						lineage,
						timestamp: entry.name.slice(
							PREFIX_START_INDEX,
							-RECORD_SUFFIX.length,
						),
					});
				}
			}
		},
	);

	return attempts;
}

export { replayRecordFile, replayAttemptIds };
export type { StageAttemptId };
