import { join } from "node:path";

import { directoryNames, entries } from "./record-directory-entries";
import {
	ATTEMPT_FILE,
	OPERATOR_STOP_FILE,
	RECORD_SUFFIX,
} from "./record-file-names";

const PREFIX_START_INDEX = 0;

interface ConfirmationRepPaths {
	readonly directory: string;
	readonly recordFile: string;
	readonly attemptFile: string;
	readonly transcriptFile: string;
	readonly finalFile: string;
	readonly stagesDirectory: string;
	readonly checkpointsDirectory: string;
	readonly stageFile: (stage: string) => string;
	readonly checkpointDirectory: (stage: string) => string;
}

interface ConfirmationGroupPaths {
	readonly directory: string;
	readonly groupFile: string;
	readonly operatorStopFile: string;
	readonly inputsDirectory: string;
	readonly reportFile: string;
	readonly repsDirectory: string;
	readonly rep: (repId: string) => ConfirmationRepPaths;
}

function confirmationGroupPaths(
	runsDirectory: string,
	groupId: string,
): ConfirmationGroupPaths {
	const directory = join(runsDirectory, "confirmations", groupId);
	const repsDirectory = join(directory, "reps");

	return {
		directory,
		groupFile: join(directory, "group.json"),
		inputsDirectory: join(directory, "inputs"),
		operatorStopFile: join(directory, OPERATOR_STOP_FILE),
		rep: (repId) => {
			const repDirectory = join(repsDirectory, repId);
			const stagesDirectory = join(repDirectory, "stages");
			const checkpointsDirectory = join(repDirectory, "checkpoints");

			return {
				attemptFile: join(repDirectory, ATTEMPT_FILE),
				checkpointDirectory: (stage) => join(checkpointsDirectory, stage),
				checkpointsDirectory,
				directory: repDirectory,
				finalFile: join(repDirectory, "final.json"),
				recordFile: join(repDirectory, "rep.json"),
				stageFile: (stage) => join(stagesDirectory, `${stage}.json`),
				stagesDirectory,
				transcriptFile: join(repDirectory, "transcript.jsonl"),
			};
		},
		reportFile: join(directory, "report.json"),
		repsDirectory,
	};
}

async function confirmationGroupIds(
	runsDirectory: string,
): Promise<readonly string[]> {
	return await directoryNames(join(runsDirectory, "confirmations"));
}

/** Every rep directory a confirmation group holds, whether or not it finished. */
async function confirmationRepIds(
	runsDirectory: string,
	groupId: string,
): Promise<readonly string[]> {
	return await directoryNames(
		confirmationGroupPaths(runsDirectory, groupId).repsDirectory,
	);
}

/**
 * Every stage one rep kept a record of, from its stage files and its
 * checkpoints, so a rep's reads can be listed without the pipeline its group
 * froze.
 */
async function confirmationRepStageNames(
	runsDirectory: string,
	groupId: string,
	repId: string,
): Promise<readonly string[]> {
	const rep = confirmationGroupPaths(runsDirectory, groupId).rep(repId);
	const found = await entries(rep.stagesDirectory);
	const stageFiles = found
		.filter((entry) => entry.isFile() && entry.name.endsWith(RECORD_SUFFIX))
		.map(({ name }) => name.slice(PREFIX_START_INDEX, -RECORD_SUFFIX.length));
	const checkpoints = await directoryNames(rep.checkpointsDirectory);

	return [...new Set([...stageFiles, ...checkpoints])].toSorted();
}

export {
	confirmationGroupPaths,
	confirmationGroupIds,
	confirmationRepIds,
	confirmationRepStageNames,
};

export type { ConfirmationRepPaths, ConfirmationGroupPaths };
