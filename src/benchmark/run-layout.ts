import { join } from "node:path";

import { directoryNames, entries } from "./record-directory-entries";
import { OPERATOR_STOP_FILE, RECORD_SUFFIX } from "./record-file-names";
import { recordFileExists } from "./record-read-scope";
import { replayRecordFile } from "./replay-layout";

const PREFIX_START_INDEX = 0;

const CHECKPOINTS_SUFFIX = ".checkpoints";

const STOPPED_SESSION_SUFFIX = ".session";

const MANIFEST_FILE = "manifest.json";

const PAUSE_REQUEST_FILE = "pause-request.json";

const PAUSED_FILE = "paused.json";

const CHECKPOINT_FILE = "checkpoint.json";

interface RunLocation {
	readonly runsDirectory: string;
	readonly run: string;
}

interface BenchmarkRunPaths {
	readonly runsDirectory: string;
	readonly name: string;
	readonly artifactFile: string;
	readonly reviewFile: string;
	readonly checkpointsDirectory: string;
	readonly manifestFile: string;
	readonly pauseRequestFile: string;
	readonly pausedFile: string;
	readonly operatorStopFile: string;
	readonly replaysDirectory: string;
	readonly stageFile: (stage: string) => string;
	readonly checkpointDirectory: (stage: string) => string;
	/**
	 * Where a stage whose grade stopped the run keeps its session, since it
	 * saves no checkpoint to keep it in. Beside the stop record and outside the
	 * checkpoints directory, where a stage directory without a checkpoint
	 * would read as a broken checkpoint.
	 */
	readonly stoppedSessionDirectory: (stage: string) => string;
	readonly replayDirectory: (lineage: string) => string;
	readonly replayRecordFile: (lineage: string, timestamp: string) => string;
}

function benchmarkRunsDirectory(controlDirectory: string): string {
	return join(controlDirectory, ".benchmark-runs");
}

/**
 * One database, not one per run: per decision-3 the event store is derived
 * state a reader can delete and rebuild, and every run in flight at once
 * writes into it, keyed by its own run id.
 */
function runEventsDatabaseFile(runsDirectory: string): string {
	return join(runsDirectory, "run-events.sqlite");
}

/**
 * Operator grades sit in a directory of their own, so no reader that lists a
 * run's `<run>.*.json` files takes one for a stage record.
 */
function operatorGradesDirectory(runsDirectory: string): string {
	return join(runsDirectory, "operator-grades");
}

/**
 * Root-cause analyses sit in a directory of their own for the same reason as
 * operator grades: a `<run>.*.json` file beside the run reads as a stage.
 */
function rootCauseAnalysesDirectory(runsDirectory: string): string {
	return join(runsDirectory, "analyses");
}

/**
 * The directory entry holding a run's checkpoints. A reader that walks the
 * runs directory one segment at a time needs the entry name rather than the
 * joined path `benchmarkRunPaths` returns.
 */
function checkpointsEntryForRun(name: string): string {
	return `${name}${CHECKPOINTS_SUFFIX}`;
}

/** The runs directory entry holding a stopped stage's session. */
function stoppedSessionEntry(name: string, stage: string): string {
	return `${name}.${stage}${STOPPED_SESSION_SUFFIX}`;
}

function runNameFromCheckpointsEntry(entry: string): string | undefined {
	if (!entry.endsWith(CHECKPOINTS_SUFFIX)) {
		return undefined;
	}

	return entry.slice(PREFIX_START_INDEX, -CHECKPOINTS_SUFFIX.length);
}

function benchmarkRunPaths(
	runsDirectory: string,
	name: string,
): BenchmarkRunPaths {
	const checkpointsDirectory = join(
		runsDirectory,
		`${name}${CHECKPOINTS_SUFFIX}`,
	);
	const replaysDirectory = join(runsDirectory, "replays");

	return {
		artifactFile: join(runsDirectory, `${name}.json`),
		checkpointDirectory: (stage) => join(checkpointsDirectory, stage),
		checkpointsDirectory,
		manifestFile: join(checkpointsDirectory, MANIFEST_FILE),
		name,
		operatorStopFile: join(checkpointsDirectory, OPERATOR_STOP_FILE),
		pauseRequestFile: join(checkpointsDirectory, PAUSE_REQUEST_FILE),
		pausedFile: join(checkpointsDirectory, PAUSED_FILE),
		replayDirectory: (lineage) => join(replaysDirectory, lineage),
		replayRecordFile: (lineage, timestamp) =>
			replayRecordFile(runsDirectory, lineage, timestamp),
		replaysDirectory,
		reviewFile: join(runsDirectory, `${name}.review.json`),
		runsDirectory,
		stageFile: (stage) => join(runsDirectory, `${name}.${stage}.json`),
		stoppedSessionDirectory: (stage) =>
			join(runsDirectory, stoppedSessionEntry(name, stage)),
	};
}

function checkpointRecordFile(checkpointDirectory: string): string {
	return join(checkpointDirectory, CHECKPOINT_FILE);
}

/** Whether a stage of a run saved its checkpoint record. */
async function checkpointRecorded(
	paths: Pick<BenchmarkRunPaths, "checkpointDirectory">,
	stage: string,
): Promise<boolean> {
	return await recordFileExists(
		checkpointRecordFile(paths.checkpointDirectory(stage)),
	);
}

async function recordedRunNames(
	runsDirectory: string,
): Promise<readonly string[]> {
	const names = await directoryNames(runsDirectory);

	return names
		.map((entry) => runNameFromCheckpointsEntry(entry))
		.filter((name) => name !== undefined);
}

const REVIEW_SUFFIX = ".review.json";

/**
 * Every `<run>.<stage>.json` file a run wrote, the artifact and the review
 * file excluded: a normal stage writes a judged scorecard here, and a stage
 * that stopped the run overwrites the same path with a stop record instead,
 * so this is where a caller looks to tell which stage stopped a run that
 * never wrote an artifact.
 */
async function runStageFiles(
	runsDirectory: string,
	run: string,
): Promise<readonly string[]> {
	const found = await entries(runsDirectory);
	const prefix = `${run}.`;

	return found
		.filter(
			(entry) =>
				entry.isFile() &&
				entry.name.startsWith(prefix) &&
				entry.name.endsWith(RECORD_SUFFIX) &&
				!entry.name.endsWith(REVIEW_SUFFIX) &&
				entry.name !== `${run}${RECORD_SUFFIX}`,
		)
		.map((entry) => join(runsDirectory, entry.name));
}

/**
 * Every stage a run recorded a checkpoint for, sorted. A run with no
 * checkpoints directory recorded nothing, not a failure.
 */
async function checkpointStageNames(
	runsDirectory: string,
	run: string,
): Promise<readonly string[]> {
	return await directoryNames(
		benchmarkRunPaths(runsDirectory, run).checkpointsDirectory,
	);
}

export { runNameFromTimestamp } from "./record-file-names";

export { replayRecordFile, replayAttemptIds } from "./replay-layout";

export {
	confirmationGroupPaths,
	confirmationGroupIds,
	confirmationRepIds,
	confirmationRepStageNames,
} from "./confirmation-layout";

export {
	sessionAttemptPaths,
	sessionAttemptIds,
} from "./session-attempt-layout";

export { comparisonReportPaths, comparisonDigests } from "./comparison-layout";

export { launchPaths, launchIds } from "./launch-layout";

export type {
	ConfirmationRepPaths,
	ConfirmationGroupPaths,
} from "./confirmation-layout";

export type { ComparisonReportPaths } from "./comparison-layout";

export type { LaunchPaths } from "./launch-layout";

export type {
	SessionAttemptId,
	SessionAttemptPaths,
} from "./session-attempt-layout";

export type { StageAttemptId } from "./replay-layout";

export {
	benchmarkRunsDirectory,
	runEventsDatabaseFile,
	operatorGradesDirectory,
	rootCauseAnalysesDirectory,
	checkpointsEntryForRun,
	stoppedSessionEntry,
	runNameFromCheckpointsEntry,
	benchmarkRunPaths,
	checkpointRecordFile,
	checkpointRecorded,
	recordedRunNames,
	runStageFiles,
	checkpointStageNames,
};

export type { RunLocation, BenchmarkRunPaths };
