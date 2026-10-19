import { join } from "node:path";

import { entries } from "./record-directory-entries";
import { RECORD_SUFFIX } from "./record-file-names";

const PREFIX_START_INDEX = 0;

const LAUNCHES_DIRECTORY = "launches";

interface LaunchPaths {
	readonly directory: string;
	readonly recordFile: string;
	readonly logFile: string;
}

/**
 * A browser launch is kept in the records directory rather than in server
 * memory, so the pid it started is still known after the server restarts.
 */
function launchPaths(runsDirectory: string, id: string): LaunchPaths {
	const directory = join(runsDirectory, LAUNCHES_DIRECTORY);

	return {
		directory,
		logFile: join(directory, `${id}.log`),
		recordFile: join(directory, `${id}${RECORD_SUFFIX}`),
	};
}

async function launchIds(runsDirectory: string): Promise<readonly string[]> {
	const found = await entries(join(runsDirectory, LAUNCHES_DIRECTORY));

	return found
		.filter((entry) => entry.isFile() && entry.name.endsWith(RECORD_SUFFIX))
		.map(({ name }) => name.slice(PREFIX_START_INDEX, -RECORD_SUFFIX.length));
}

export { launchPaths, launchIds };
export type { LaunchPaths };
